/**
 * @module cron
 *
 * Validated cron expressions with next-occurrence computation.
 *
 * **Why Cron in a functional library?**
 * Cron schedules are a trust boundary: user-supplied strings need validation
 * before use. `Cron.parse` returns `Result<CronExpression, SchemaError>`,
 * keeping the parse/validate/use pattern consistent with Schema. The branded
 * `CronExpression` type prevents raw strings from being used as schedules.
 *
 * Supports the standard 5-field format: minute, hour, day-of-month, month,
 * day-of-week. Each field supports wildcards (*), ranges (1-5), steps (* /5),
 * and lists (1,3,5).
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import type { SchemaError } from "../data/schema.js";
import type { Type } from "./nominal.js";

/**
 * A validated cron expression string (5-field standard format).
 *
 * Construct via {@link Cron}.parse(). The brand prevents raw strings
 * from being used where a validated cron expression is expected.
 */
export type CronExpression = Type<"CronExpression", string>;

// ── Internal parser ─────────────────────────────────────────────────────────

/** Parsed representation of a single cron field. */
interface CronField {
  readonly values: ReadonlySet<number>;
}

/** Ranges for each cron field position. */
const FIELD_RANGES: readonly (readonly [number, number])[] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

const FIELD_NAMES: readonly string[] = ["minute", "hour", "day-of-month", "month", "day-of-week"];

const cronErr = (expected: string, received: string): Result<never, SchemaError> =>
  Err({ path: ["cron"], expected, received });

/** Parse a single cron field. Supports wildcards, ranges, steps, and lists. */
const parseField = (
  field: string,
  min: number,
  max: number,
  fieldName: string,
): Result<CronField, SchemaError> => {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    // Handle step: "*/5" or "1-10/2"
    const stepParts = part.split("/");
    if (stepParts.length > 2) {
      return cronErr(`valid ${fieldName} field`, `invalid step "${part}"`);
    }

    const step = stepParts.length === 2 ? Number(stepParts[1]) : 1;
    if (!Number.isInteger(step) || step < 1) {
      return cronErr(`positive step for ${fieldName}`, `"${stepParts[1]}"`);
    }

    const range = stepParts[0]!;

    if (range === "*") {
      for (let i = min; i <= max; i += step) values.add(i);
      continue;
    }

    // Handle range: "1-5"
    if (range.includes("-")) {
      const [startStr, endStr] = range.split("-");
      const start = Number(startStr);
      const end = Number(endStr);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < min ||
        end > max ||
        start > end
      ) {
        return cronErr(`${fieldName} range ${min}-${max}`, `"${range}"`);
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    // Handle single value
    const val = Number(range);
    if (!Number.isInteger(val) || val < min || val > max) {
      return cronErr(`${fieldName} value ${min}-${max}`, `"${range}"`);
    }
    values.add(val);
  }

  return Ok({ values });
};

/** Parse a complete 5-field cron expression. */
const parseCron = (expr: string): Result<readonly CronField[], SchemaError> => {
  const trimmed = expr.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length !== 5) {
    return cronErr("5-field cron expression", `${parts.length} fields`);
  }

  const fields: CronField[] = [];
  for (let i = 0; i < 5; i++) {
    const [min, max] = FIELD_RANGES[i]!;
    const result = parseField(parts[i]!, min, max, FIELD_NAMES[i]!);
    // Why: Result<CronField, SchemaError> needs to become Result<CronField[], SchemaError>.
    // The error type is unchanged; only the Ok payload type differs.
    if (result.isErr) return result as unknown as Result<never, SchemaError>;
    fields.push(result.value);
  }

  return Ok(fields);
};

// ── Cache parsed fields for efficient next() computation ────────────────────

const PARSED_CACHE = new Map<string, readonly CronField[]>();

const getCachedFields = (expr: CronExpression): readonly CronField[] => {
  // Why: CronExpression is a branded string. Unbrand to use as Map key.
  const key = expr as unknown as string;
  let fields = PARSED_CACHE.get(key);
  if (fields === undefined) {
    const result = parseCron(key);
    if (result.isErr) return []; // Should not happen for validated expressions
    fields = result.value;
    PARSED_CACHE.set(key, fields);
  }
  return fields;
};

// ── Next occurrence ─────────────────────────────────────────────────────────

/**
 * Find the next date matching the cron expression after `after`.
 * Searches up to 4 years ahead to avoid infinite loops.
 */
const nextOccurrence = (cron: CronExpression, after?: Date): Option<Date> => {
  const fields = getCachedFields(cron);
  if (fields.length !== 5) return None;

  const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields as [
    CronField,
    CronField,
    CronField,
    CronField,
    CronField,
  ];

  const start = after ? new Date(after.getTime()) : new Date();
  // Advance by 1 minute from the starting point
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  const maxDate = new Date(start.getTime());
  maxDate.setFullYear(maxDate.getFullYear() + 4);

  const current = new Date(start.getTime());

  while (current.getTime() < maxDate.getTime()) {
    if (!months.values.has(current.getMonth() + 1)) {
      current.setMonth(current.getMonth() + 1, 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    if (!daysOfMonth.values.has(current.getDate())) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    if (!daysOfWeek.values.has(current.getDay())) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    if (!hours.values.has(current.getHours())) {
      current.setHours(current.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (!minutes.values.has(current.getMinutes())) {
      current.setMinutes(current.getMinutes() + 1, 0, 0);
      continue;
    }

    return Some(new Date(current.getTime()));
  }

  return None;
};

/** Check if a date matches a cron expression. */
const matchesCron = (cron: CronExpression, date: Date): boolean => {
  const fields = getCachedFields(cron);
  if (fields.length !== 5) return false;

  const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields as [
    CronField,
    CronField,
    CronField,
    CronField,
    CronField,
  ];

  return (
    minutes.values.has(date.getMinutes()) &&
    hours.values.has(date.getHours()) &&
    daysOfMonth.values.has(date.getDate()) &&
    months.values.has(date.getMonth() + 1) &&
    daysOfWeek.values.has(date.getDay())
  );
};

// ── Public namespace (const/type merge) ─────────────────────────────────────

/**
 * Parse, validate, and compute cron schedules.
 *
 * Uses the standard 5-field format: minute hour day-of-month month day-of-week.
 *
 * @example
 * ```ts
 * const schedule = Cron.parse('0 9 * * 1-5'); // 9am weekdays
 * if (schedule.isOk) {
 *   const next = Cron.next(schedule.value);
 *   const matches = Cron.matches(schedule.value, new Date());
 * }
 * ```
 */
export const Cron: {
  readonly parse: (expr: string) => Result<CronExpression, SchemaError>;
  readonly next: (cron: CronExpression, after?: Date) => Option<Date>;
  readonly matches: (cron: CronExpression, date: Date) => boolean;
} = {
  parse: (expr: string): Result<CronExpression, SchemaError> => {
    const result = parseCron(expr);
    // Why: parseCron returns Result<CronField[], SchemaError>.
    // Widen to Result<never, SchemaError> so it fits Result<CronExpression, SchemaError>.
    if (result.isErr) return result as unknown as Result<never, SchemaError>;
    // Cache the parsed fields
    PARSED_CACHE.set(expr, result.value);
    // Why: Brand the validated string as CronExpression (nominal type boundary).
    return Ok(expr as unknown as CronExpression);
  },
  next: nextOccurrence,
  matches: matchesCron,
};
