/**
 * types.test.ts - Compile-time type safety suite.
 *
 * This file is NOT executed. It is type-checked only:
 *   tsgo --noEmit tests/types.test.ts
 *
 * Every @ts-expect-error must produce exactly one error.
 * If any @ts-expect-error becomes unused, the build fails - meaning
 * the framework stopped catching a type error it should catch.
 */

import {
  Record, List, Schema,
  Ok, Err, Some, None, Result, Option,
  match, tryCatch,
  pipe, flow, Lazy, Task,
  ErrType,
  Program,
  type Type,
  type ImmutableRecord, type ImmutableList, type SchemaType,
  type ErrTypeConstructor,
  type Program as ProgramType,
} from '../src/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Record - property types
// ═══════════════════════════════════════════════════════════════════════════════

const user = Record({
  name: 'Alice',
  age: 30,
  active: true,
  address: { city: 'Sydney', geo: { lat: -33.87, lng: 151.21 } },
  tags: ['fp', 'ts'],
});

// Reads infer widened types
const _name: string = user.name;
const _age: number = user.age;
const _active: boolean = user.active;
const _city: string = user.address.city;
const _lat: number = user.address.geo.lat;

// Nested records have methods
const _nestedSet: ImmutableRecord<{ city: string; geo: { lat: number; lng: number } }> =
  user.address.set(a => a.city, 'Melbourne');

// @ts-expect-error - wrong type assignment
const _wrongType: number = user.name;

// @ts-expect-error - nonexistent property
const _nope = user.nonexistent;

// @ts-expect-error - readonly
user.name = 'X';

// @ts-expect-error - nested readonly
user.address.city = 'X';

// ═══════════════════════════════════════════════════════════════════════════════
// Record.set - type-safe value
// ═══════════════════════════════════════════════════════════════════════════════

user.set(u => u.name, 'New');
user.set(u => u.age, 40);
user.set(u => u.address.city, 'San Francisco');

// @ts-expect-error - number ≠ string
user.set(u => u.name, 42);

// @ts-expect-error - string ≠ number
user.set(u => u.age, 'old');

// ═══════════════════════════════════════════════════════════════════════════════
// Record.update - fn signature
// ═══════════════════════════════════════════════════════════════════════════════

user.update(u => u.name, n => n.toUpperCase());
user.update(u => u.age, a => a + 1);

// @ts-expect-error - fn returns wrong type
user.update(u => u.name, _n => 42);

// ═══════════════════════════════════════════════════════════════════════════════
// Record.produce
// ═══════════════════════════════════════════════════════════════════════════════

user.produce(d => {
  d.name = 'New';
  d.age = 40;
  d.address.city = 'San Francisco';
});

// ═══════════════════════════════════════════════════════════════════════════════
// Record.merge - Partial<T>
// ═══════════════════════════════════════════════════════════════════════════════

user.merge({ name: 'New' });
user.merge({ age: 40, name: 'New' });

// @ts-expect-error - wrong type in partial
user.merge({ age: 'old' });

// ═══════════════════════════════════════════════════════════════════════════════
// Record.at → Option
// ═══════════════════════════════════════════════════════════════════════════════

const _optName: Option<string> = user.at(u => u.name);
const _optAge: Option<number> = user.at(u => u.age);

// ═══════════════════════════════════════════════════════════════════════════════
// Record.equals
// ═══════════════════════════════════════════════════════════════════════════════

const other = Record({
  name: 'Bob', age: 25, active: false,
  address: { city: 'Melbourne', geo: { lat: -37.81, lng: 144.96 } },
  tags: ['x'],
});
const _eq: boolean = user.equals(other);

// ═══════════════════════════════════════════════════════════════════════════════
// List - element types
// ═══════════════════════════════════════════════════════════════════════════════

const nums = List([1, 2, 3]);
const _n0: number = nums[0]!;

// @ts-expect-error - wrong element type
const _s0: string = nums[0]!;

const _found: Option<number> = nums.find(n => n > 2);
const _first: Option<number> = nums.first();

// @ts-expect-error - wrong append type
nums.append('x');

// @ts-expect-error - wrong setAt type
nums.setAt(0, 'x');

// ═══════════════════════════════════════════════════════════════════════════════
// Result - type flow
// ═══════════════════════════════════════════════════════════════════════════════

const res: Result<number, string> = Ok(42);
const _mapped: Result<string, string> = res.map(String);
const _chained: Result<boolean, string> = res.flatMap(n => n > 0 ? Ok(true) : Err('neg'));
const _unwrapped: number = res.unwrapOr(0);

// @ts-expect-error - wrong fallback type
const _bad: number = res.unwrapOr('x');

// Result.ap type flow
const _apResult: Result<string, string> = res.ap(Ok((n: number) => String(n)));

// ═══════════════════════════════════════════════════════════════════════════════
// Option - type flow
// ═══════════════════════════════════════════════════════════════════════════════

const optN: Option<number> = Some(42);
const _optS: Option<string> = optN.map(String);
const _toRes: Result<number, string> = optN.toResult('missing');

// @ts-expect-error - wrong unwrapOr type
const _badOr: number = optN.unwrapOr('x');

// Option.ap type flow
const _apOption: Option<string> = optN.ap(Some((n: number) => String(n)));

// ═══════════════════════════════════════════════════════════════════════════════
// Schema.Infer
// ═══════════════════════════════════════════════════════════════════════════════

const UserSchema = Schema.object({
  name: Schema.string,
  age: Schema.number,
  tags: Schema.array(Schema.string),
  address: Schema.object({
    city: Schema.string,
    geo: Schema.object({ lat: Schema.number, lng: Schema.number }),
  }),
});

type User = Schema.Infer<typeof UserSchema>;
type _T1 = User['name'] extends string ? true : false; const _t1: _T1 = true;
type _T2 = User['address']['geo']['lat'] extends number ? true : false; const _t2: _T2 = true;

const parsed = UserSchema.parse({});
if (parsed.isOk) {
  const _pName: string = parsed.value.name;
  const _pCity: string = parsed.value.address.city;

  // @ts-expect-error - nonexistent field
  parsed.value.nope;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Type<Name, Base> - nominal
// ═══════════════════════════════════════════════════════════════════════════════

type UserId = Type<'UserId', string>;
type PostId = Type<'PostId', string>;
declare function getUser(id: UserId): void;
const uid = 'u_001' as UserId;
const pid = 'p_001' as PostId;
getUser(uid);

// @ts-expect-error - PostId ≠ UserId
getUser(pid);

// @ts-expect-error - plain string ≠ UserId
getUser('u_001');

// ═══════════════════════════════════════════════════════════════════════════════
// pipe / flow - inference
// ═══════════════════════════════════════════════════════════════════════════════

const _piped: string = pipe(42, (n: number) => n + 1, String);
const _fn = flow((s: string) => s.length, (n: number) => n > 5);
const _fr: boolean = _fn('hello');

// ═══════════════════════════════════════════════════════════════════════════════
// Lazy / Task - types preserved
// ═══════════════════════════════════════════════════════════════════════════════

const lazy = new Lazy(() => 42);
const _lv: number = lazy.value;
const _lm: Lazy<string> = lazy.map(String);

const task = new Task<number, string>(async () => Ok(42));
const _tm: Task<string, string> = task.map(String);

// Task.memoize preserves types
const _memoized: Task<number, string> = task.memoize();

// Task.timeout preserves T, uses same E
const _timed: Task<number, string> = task.timeout(1000, () => 'timeout');

// Task.retry preserves types
const _retried: Task<number, string> = task.retry(3);
const _retriedDelay: Task<number, string> = task.retry(3, 100);

// Task.race preserves types
const _raced: Task<number, string> = Task.race([task]);

// Task.allSettled -> Task<readonly Result[], never>
const _settled: Task<readonly Result<number, string>[], never> = Task.allSettled([task]);

// ═══════════════════════════════════════════════════════════════════════════════
// List.clone - types preserved
// ═══════════════════════════════════════════════════════════════════════════════

const cloned: ImmutableList<{ id: number }> = List.clone([{ id: 1 }]);
const _clonedId: number = cloned[0]!.id;

// ═══════════════════════════════════════════════════════════════════════════════
// ErrType - literal type narrowing
// ═══════════════════════════════════════════════════════════════════════════════

const NotFound = ErrType('NotFound', 'NOT_FOUND');
const Forbidden = ErrType('Forbidden', 'FORBIDDEN');

// Constructor type is inferred
const _ctor: ErrTypeConstructor<'NotFound', 'NOT_FOUND'> = NotFound;

// Instance has literal types on tag and code
const nfErr = NotFound('gone');
const _nfTag: 'NotFound' = nfErr.tag;
const _nfName: 'NotFound' = nfErr.name;
const _nfCode: 'NOT_FOUND' = nfErr.code;
const _nfMsg: string = nfErr.message;
const _nfMeta: Readonly<Record<string, unknown>> = nfErr.metadata;
const _nfTs: number = nfErr.timestamp;
const _nfStack: string | undefined = nfErr.stack;

// @ts-expect-error - tag literal mismatch
const _wrongTag: 'Forbidden' = nfErr.tag;

// @ts-expect-error - code literal mismatch
const _wrongCode: 'FORBIDDEN' = nfErr.code;

// toResult() preserves error type
const _nfResult: Result<string, ErrType<'NotFound', 'NOT_FOUND'>> = nfErr.toResult<string>();

// Discriminated union narrowing via switch on tag
type AppError =
  | ErrType<'NotFound', 'NOT_FOUND'>
  | ErrType<'Forbidden', 'FORBIDDEN'>;

const appErr: AppError = nfErr;
switch (appErr.tag) {
  case 'NotFound': {
    const _c: 'NOT_FOUND' = appErr.code;
    break;
  }
  case 'Forbidden': {
    const _c: 'FORBIDDEN' = appErr.code;
    break;
  }
}

// Constructor.is() narrows
declare const unknownErr: AppError;
if (NotFound.is(unknownErr)) {
  const _narrowedTag: 'NotFound' = unknownErr.tag;
  const _narrowedCode: 'NOT_FOUND' = unknownErr.code;
}

// ErrType.is() general guard
declare const mystery: unknown;
if (ErrType.is(mystery)) {
  const _t: string = mystery.tag;
  const _c: string = mystery.code;
  const _m: string = mystery.message;
}

// Constructor.tag and .code are literal types
const _ctorTag: 'NotFound' = NotFound.tag;
const _ctorCode: 'NOT_FOUND' = NotFound.code;

// ═══════════════════════════════════════════════════════════════════════════════
// Result namespace - static utilities
// ═══════════════════════════════════════════════════════════════════════════════

// Result.Ok / Result.Err produce correct types
const _nsOk: Result<number, never> = Result.Ok(42);
const _nsErr: Result<never, string> = Result.Err('fail');

// Result.tryCatch returns Result
const _nsTry: Result<number, string> = Result.tryCatch(() => 42, String);

// Result.collect returns Result of readonly array
const _nsCollect: Result<readonly number[], string> = Result.collect([Ok(1), Ok(2)]);

// Result.is is a type guard
declare const _unknownVal: unknown;
if (Result.is(_unknownVal)) {
  const _guarded: Result<unknown, unknown> = _unknownVal;
}

// Result.match infers return type
const _nsMatch: string = Result.match(Ok(42) as Result<number, string>, {
  Ok: v => String(v),
  Err: e => e,
});

// Result works in both type and value positions simultaneously
const _typePos: Result<number, string> = Ok(1);
const _valuePos: boolean = Result.is(_typePos);

// ═══════════════════════════════════════════════════════════════════════════════
// Option namespace - static utilities
// ═══════════════════════════════════════════════════════════════════════════════

// Option.Some / Option.None produce correct types
const _nsSome: Option<number> = Option.Some(42);
const _nsNone: Option<never> = Option.None;

// Option.fromNullable returns Option
const _nsFrom: Option<string> = Option.fromNullable('hello' as string | null);

// Option.collect returns Option of readonly array
const _nsOptCollect: Option<readonly number[]> = Option.collect([Some(1), Some(2)]);

// Option.is is a type guard
if (Option.is(_unknownVal)) {
  const _guarded: Option<unknown> = _unknownVal;
}

// Option.match infers return type
const _nsOptMatch: number = Option.match(Some(42), {
  Some: v => v * 2,
  None: () => 0,
});

// Option works in both type and value positions simultaneously
const _optTypePos: Option<number> = Some(1);
const _optValuePos: boolean = Option.is(_optTypePos);

// ═══════════════════════════════════════════════════════════════════════════════
// Standalone aliases: match, tryCatch
// ═══════════════════════════════════════════════════════════════════════════════

// match() infers return type for Result
const _matchRes: string = match(Ok(42) as Result<number, string>, {
  Ok: v => String(v),
  Err: e => e,
});

// match() infers return type for Option
const _matchOpt: number = match(Some(42), {
  Some: v => v * 2,
  None: () => 0,
});

// tryCatch returns Result
const _tryRes: Result<number, string> = tryCatch(() => 42, String);

// ═══════════════════════════════════════════════════════════════════════════════
// Program - type inference
// ═══════════════════════════════════════════════════════════════════════════════

// Program from Task preserves types
const _progTask: ProgramType<number, never> = Program('test', Task.of(42));

// Program from effect function preserves types
const _progFn: ProgramType<string, string> = Program(
  'test',
  (_signal: AbortSignal) => new Task<string, string>(async () => Ok('done'))
);

// execute() returns Promise<Result<T, E>>
const _execResult: Promise<Result<number, never>> = _progTask.execute();

// execute() accepts optional AbortSignal
const _execWithSignal: Promise<Result<number, never>> = _progTask.execute(new AbortController().signal);
