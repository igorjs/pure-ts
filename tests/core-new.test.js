/**
 * core-new.test.js - Tests for Eq, Ord, Match, State, Lens, optics,
 * Result/Option traverse/sequence, Task traverse/sequence/ap,
 * and List sortByOrd/uniqBy/groupBy.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  Eq,
  Ord,
  Match,
  State,
  Lens,
  LensOptional,
  Prism,
  Traversal,
  Iso,
  Ok,
  Err,
  Some,
  None,
  Result,
  Option,
  Task,
  List,
  ErrType,
  pipe,
} = await import("../dist/index.js");

// =============================================================================
// 1. Eq
// =============================================================================

describe("Eq", () => {
  describe("Eq.string", () => {
    it("returns true for equal strings", () => {
      assert.equal(Eq.string.equals("hello", "hello"), true);
    });

    it("returns false for different strings", () => {
      assert.equal(Eq.string.equals("hello", "world"), false);
    });

    it("returns true for empty strings", () => {
      assert.equal(Eq.string.equals("", ""), true);
    });

    it("is case-sensitive", () => {
      assert.equal(Eq.string.equals("Hello", "hello"), false);
    });
  });

  describe("Eq.number", () => {
    it("returns true for equal numbers", () => {
      assert.equal(Eq.number.equals(42, 42), true);
    });

    it("returns false for different numbers", () => {
      assert.equal(Eq.number.equals(1, 2), false);
    });

    it("handles zero", () => {
      assert.equal(Eq.number.equals(0, 0), true);
    });

    it("handles negative numbers", () => {
      assert.equal(Eq.number.equals(-5, -5), true);
      assert.equal(Eq.number.equals(-5, 5), false);
    });

    it("handles floating point", () => {
      assert.equal(Eq.number.equals(0.1 + 0.2, 0.3), false); // IEEE 754
    });
  });

  describe("Eq.boolean", () => {
    it("returns true for equal booleans", () => {
      assert.equal(Eq.boolean.equals(true, true), true);
      assert.equal(Eq.boolean.equals(false, false), true);
    });

    it("returns false for different booleans", () => {
      assert.equal(Eq.boolean.equals(true, false), false);
      assert.equal(Eq.boolean.equals(false, true), false);
    });
  });

  describe("Eq.date", () => {
    it("returns true for dates with the same timestamp", () => {
      const d1 = new Date("2024-01-01");
      const d2 = new Date("2024-01-01");
      assert.equal(Eq.date.equals(d1, d2), true);
    });

    it("returns false for different dates", () => {
      const d1 = new Date("2024-01-01");
      const d2 = new Date("2024-06-15");
      assert.equal(Eq.date.equals(d1, d2), false);
    });

    it("compares by time value, not reference", () => {
      const d1 = new Date(1000);
      const d2 = new Date(1000);
      assert.notEqual(d1, d2); // different references
      assert.equal(Eq.date.equals(d1, d2), true);
    });
  });

  describe("Eq.struct", () => {
    it("compares flat structs field-by-field", () => {
      const eqUser = Eq.struct({ id: Eq.number, name: Eq.string });
      assert.equal(eqUser.equals({ id: 1, name: "Alice" }, { id: 1, name: "Alice" }), true);
      assert.equal(eqUser.equals({ id: 1, name: "Alice" }, { id: 2, name: "Alice" }), false);
      assert.equal(eqUser.equals({ id: 1, name: "Alice" }, { id: 1, name: "Bob" }), false);
    });

    it("supports nested structs", () => {
      const eqAddress = Eq.struct({ city: Eq.string, zip: Eq.string });
      const eqUser = Eq.struct({ name: Eq.string, address: eqAddress });

      const u1 = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const u2 = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const u3 = { name: "Alice", address: { city: "Sydney", zip: "2000" } };

      assert.equal(eqUser.equals(u1, u2), true);
      assert.equal(eqUser.equals(u1, u3), false);
    });

    it("returns true for empty struct", () => {
      const eqEmpty = Eq.struct({});
      assert.equal(eqEmpty.equals({}, {}), true);
    });
  });

  describe("Eq.contramap", () => {
    it("derives equality through a projection function", () => {
      const eqByLength = Eq.contramap(Eq.number, s => s.length);
      assert.equal(eqByLength.equals("abc", "def"), true);
      assert.equal(eqByLength.equals("abc", "ab"), false);
    });

    it("derives Eq for objects by projecting a field", () => {
      const eqById = Eq.contramap(Eq.number, u => u.id);
      assert.equal(eqById.equals({ id: 1, name: "Alice" }, { id: 1, name: "Bob" }), true);
      assert.equal(eqById.equals({ id: 1 }, { id: 2 }), false);
    });
  });

  describe("Eq (callable factory)", () => {
    it("creates a custom Eq from a function", () => {
      const eqModulo = Eq((a, b) => a % 3 === b % 3);
      assert.equal(eqModulo.equals(4, 7), true); // both mod 3 === 1
      assert.equal(eqModulo.equals(4, 5), false);
    });
  });

  describe("frozen instances", () => {
    it("built-in Eq instances are frozen", () => {
      assert.equal(Object.isFrozen(Eq.string), true);
      assert.equal(Object.isFrozen(Eq.number), true);
      assert.equal(Object.isFrozen(Eq.boolean), true);
      assert.equal(Object.isFrozen(Eq.date), true);
    });

    it("Eq.struct returns a frozen instance", () => {
      const eq = Eq.struct({ x: Eq.number });
      assert.equal(Object.isFrozen(eq), true);
    });

    it("Eq.contramap returns a frozen instance", () => {
      const eq = Eq.contramap(Eq.number, s => s.length);
      assert.equal(Object.isFrozen(eq), true);
    });

    it("Eq factory returns a frozen instance", () => {
      const eq = Eq((a, b) => a === b);
      assert.equal(Object.isFrozen(eq), true);
    });
  });
});

// =============================================================================
// 2. Ord
// =============================================================================

describe("Ord", () => {
  describe("Ord.number", () => {
    it("returns -1 when a < b", () => {
      assert.equal(Ord.number.compare(1, 2), -1);
    });

    it("returns 0 when a === b", () => {
      assert.equal(Ord.number.compare(5, 5), 0);
    });

    it("returns 1 when a > b", () => {
      assert.equal(Ord.number.compare(10, 3), 1);
    });

    it("handles negative numbers", () => {
      assert.equal(Ord.number.compare(-5, -3), -1);
      assert.equal(Ord.number.compare(-3, -5), 1);
    });

    it("derives equals from compare", () => {
      assert.equal(Ord.number.equals(5, 5), true);
      assert.equal(Ord.number.equals(5, 6), false);
    });
  });

  describe("Ord.string", () => {
    it("compares strings lexicographically", () => {
      assert.equal(Ord.string.compare("apple", "banana"), -1);
      assert.equal(Ord.string.compare("banana", "apple"), 1);
      assert.equal(Ord.string.compare("same", "same"), 0);
    });

    it("handles empty strings", () => {
      assert.equal(Ord.string.compare("", "a"), -1);
      assert.equal(Ord.string.compare("a", ""), 1);
      assert.equal(Ord.string.compare("", ""), 0);
    });
  });

  describe("Ord.date", () => {
    it("compares dates by time value", () => {
      const earlier = new Date("2024-01-01");
      const later = new Date("2024-12-31");
      assert.equal(Ord.date.compare(earlier, later), -1);
      assert.equal(Ord.date.compare(later, earlier), 1);
      assert.equal(Ord.date.compare(earlier, new Date("2024-01-01")), 0);
    });
  });

  describe("Ord.reverse", () => {
    it("reverses the ordering", () => {
      const reversed = Ord.reverse(Ord.number);
      assert.equal(reversed.compare(1, 2), 1);
      assert.equal(reversed.compare(2, 1), -1);
      assert.equal(reversed.compare(5, 5), 0);
    });

    it("double reverse restores original ordering", () => {
      const doubleReversed = Ord.reverse(Ord.reverse(Ord.number));
      assert.equal(doubleReversed.compare(1, 2), -1);
      assert.equal(doubleReversed.compare(2, 1), 1);
    });
  });

  describe("Ord.contramap", () => {
    it("derives ordering through a projection function", () => {
      const byAge = Ord.contramap(Ord.number, u => u.age);
      assert.equal(byAge.compare({ age: 20 }, { age: 30 }), -1);
      assert.equal(byAge.compare({ age: 30 }, { age: 20 }), 1);
      assert.equal(byAge.compare({ age: 25 }, { age: 25 }), 0);
    });

    it("derives ordering by string length", () => {
      const byLength = Ord.contramap(Ord.number, s => s.length);
      assert.equal(byLength.compare("ab", "abc"), -1);
      assert.equal(byLength.compare("abc", "ab"), 1);
      assert.equal(byLength.compare("ab", "cd"), 0);
    });
  });

  describe("Ord.min", () => {
    it("returns the smaller of two values", () => {
      const min = Ord.min(Ord.number);
      assert.equal(min(3, 7), 3);
      assert.equal(min(7, 3), 3);
    });

    it("returns the first value when equal", () => {
      const min = Ord.min(Ord.number);
      assert.equal(min(5, 5), 5);
    });

    it("works with strings", () => {
      const min = Ord.min(Ord.string);
      assert.equal(min("banana", "apple"), "apple");
    });
  });

  describe("Ord.max", () => {
    it("returns the larger of two values", () => {
      const max = Ord.max(Ord.number);
      assert.equal(max(3, 7), 7);
      assert.equal(max(7, 3), 7);
    });

    it("returns the first value when equal", () => {
      const max = Ord.max(Ord.number);
      assert.equal(max(5, 5), 5);
    });

    it("works with strings", () => {
      const max = Ord.max(Ord.string);
      assert.equal(max("apple", "banana"), "banana");
    });
  });

  describe("Ord.clamp", () => {
    it("returns value when within bounds", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      assert.equal(clamp(50), 50);
    });

    it("clamps to low when below", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      assert.equal(clamp(-10), 0);
    });

    it("clamps to high when above", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      assert.equal(clamp(150), 100);
    });

    it("returns boundary values when at boundary", () => {
      const clamp = Ord.clamp(Ord.number, 0, 100);
      assert.equal(clamp(0), 0);
      assert.equal(clamp(100), 100);
    });

    it("works with strings", () => {
      const clamp = Ord.clamp(Ord.string, "b", "d");
      assert.equal(clamp("a"), "b");
      assert.equal(clamp("c"), "c");
      assert.equal(clamp("e"), "d");
    });
  });

  describe("Ord.between", () => {
    it("returns true when value is within bounds", () => {
      const between = Ord.between(Ord.number, 0, 100);
      assert.equal(between(50), true);
    });

    it("returns true at exact boundaries", () => {
      const between = Ord.between(Ord.number, 0, 100);
      assert.equal(between(0), true);
      assert.equal(between(100), true);
    });

    it("returns false when below lower bound", () => {
      const between = Ord.between(Ord.number, 0, 100);
      assert.equal(between(-1), false);
    });

    it("returns false when above upper bound", () => {
      const between = Ord.between(Ord.number, 0, 100);
      assert.equal(between(101), false);
    });
  });

  describe("Ord (callable factory)", () => {
    it("creates a custom Ord from a compare function", () => {
      const byAbsValue = Ord((a, b) => Math.abs(a) - Math.abs(b));
      assert.equal(byAbsValue.compare(-3, 2), 1);
      assert.equal(byAbsValue.compare(2, -3), -1);
      assert.equal(byAbsValue.compare(-3, 3), 0);
    });

    it("normalises compare result to -1, 0, or 1", () => {
      const ord = Ord((a, b) => a - b); // may return values other than -1/0/1
      assert.equal(ord.compare(1, 100), -1);
      assert.equal(ord.compare(100, 1), 1);
      assert.equal(ord.compare(5, 5), 0);
    });
  });

  describe("frozen instances", () => {
    it("built-in Ord instances are frozen", () => {
      assert.equal(Object.isFrozen(Ord.number), true);
      assert.equal(Object.isFrozen(Ord.string), true);
      assert.equal(Object.isFrozen(Ord.date), true);
    });
  });
});

// =============================================================================
// 3. Match
// =============================================================================

describe("Match", () => {
  describe("tag-based matching with .with()", () => {
    it("matches Ok tag", () => {
      const result = Match(Ok(42))
        .with({ tag: "Ok" }, r => r.value * 2)
        .with({ tag: "Err" }, r => 0)
        .exhaustive();

      assert.equal(result, 84);
    });

    it("matches Err tag", () => {
      const result = Match(Err("fail"))
        .with({ tag: "Ok" }, r => r.value)
        .with({ tag: "Err" }, r => `Error: ${r.error}`)
        .exhaustive();

      assert.equal(result, "Error: fail");
    });

    it("matches Option tags", () => {
      const matchSome = Match(Some(10))
        .with({ tag: "Some" }, o => o.value + 5)
        .with({ tag: "None" }, () => -1)
        .exhaustive();

      assert.equal(matchSome, 15);

      const matchNone = Match(None)
        .with({ tag: "Some" }, o => o.value)
        .with({ tag: "None" }, () => -1)
        .exhaustive();

      assert.equal(matchNone, -1);
    });
  });

  describe(".when() predicate guards", () => {
    it("matches the first true predicate", () => {
      const label = Match(95)
        .when(
          n => n >= 90,
          () => "A",
        )
        .when(
          n => n >= 80,
          () => "B",
        )
        .when(
          n => n >= 70,
          () => "C",
        )
        .otherwise(() => "F");

      assert.equal(label, "A");
    });

    it("falls through to later predicates", () => {
      const label = Match(85)
        .when(
          n => n >= 90,
          () => "A",
        )
        .when(
          n => n >= 80,
          () => "B",
        )
        .otherwise(() => "F");

      assert.equal(label, "B");
    });

    it("reaches otherwise when no predicate matches", () => {
      const label = Match(50)
        .when(
          n => n >= 90,
          () => "A",
        )
        .when(
          n => n >= 80,
          () => "B",
        )
        .otherwise(() => "F");

      assert.equal(label, "F");
    });
  });

  describe(".otherwise() fallback", () => {
    it("provides a catch-all for unmatched values", () => {
      const result = Match({ tag: "Unknown", data: 123 })
        .with({ tag: "Ok" }, () => "ok")
        .with({ tag: "Err" }, () => "err")
        .otherwise(v => `fallback: ${v.tag}`);

      assert.equal(result, "fallback: Unknown");
    });

    it("is not reached when a prior arm matches", () => {
      const result = Match(Ok(1))
        .with({ tag: "Ok" }, r => r.value)
        .otherwise(() => -1);

      assert.equal(result, 1);
    });
  });

  describe(".exhaustive()", () => {
    it("succeeds when all variants are handled", () => {
      const result = Match(Ok(10))
        .with({ tag: "Ok" }, r => r.value)
        .with({ tag: "Err" }, () => 0)
        .exhaustive();

      assert.equal(result, 10);
    });

    it("throws TypeError when no pattern matches", () => {
      assert.throws(
        () => {
          Match({ tag: "Unexpected" })
            .with({ tag: "Ok" }, () => 1)
            .with({ tag: "Err" }, () => 2)
            .exhaustive();
        },
        {
          name: "TypeError",
          message: /no pattern matched/,
        },
      );
    });
  });

  describe("chaining multiple .with() arms", () => {
    it("handles many tag-based arms", () => {
      const classify = value =>
        Match(value)
          .with({ tag: "Ok" }, r => `ok:${r.value}`)
          .with({ tag: "Err" }, r => `err:${r.error}`)
          .otherwise(() => "unknown");

      assert.equal(classify(Ok("yes")), "ok:yes");
      assert.equal(classify(Err("no")), "err:no");
      assert.equal(classify({ tag: "Other" }), "unknown");
    });

    it("mixes .with() and .when() arms", () => {
      const result = Match(Ok(42))
        .with({ tag: "Err" }, () => "error")
        .when(
          v => v.tag === "Ok" && v.value > 100,
          () => "large ok",
        )
        .with({ tag: "Ok" }, r => `ok:${r.value}`)
        .exhaustive();

      assert.equal(result, "ok:42");
    });
  });

  describe("matching non-tagged values", () => {
    it("uses .when() for primitive matching", () => {
      const result = Match("hello")
        .when(
          s => s.length > 10,
          () => "long",
        )
        .when(
          s => s.length > 3,
          () => "medium",
        )
        .otherwise(() => "short");

      assert.equal(result, "medium");
    });
  });
});

// =============================================================================
// 4. State
// =============================================================================

describe("State", () => {
  describe("State.of", () => {
    it("wraps a value without modifying state", () => {
      const s = State.of(42);
      const [value, state] = s.run("initial");
      assert.equal(value, 42);
      assert.equal(state, "initial");
    });

    it("works with different state types", () => {
      const s = State.of("hello");
      const [value, state] = s.run(0);
      assert.equal(value, "hello");
      assert.equal(state, 0);
    });
  });

  describe("State.get", () => {
    it("reads the current state as the value", () => {
      const s = State.get();
      const [value, state] = s.run(99);
      assert.equal(value, 99);
      assert.equal(state, 99);
    });

    it("does not modify the state", () => {
      const s = State.get();
      const [_, state] = s.run("keep");
      assert.equal(state, "keep");
    });
  });

  describe("State.set", () => {
    it("replaces the state", () => {
      const s = State.set("new");
      const [value, state] = s.run("old");
      assert.equal(value, undefined);
      assert.equal(state, "new");
    });
  });

  describe("State.modify", () => {
    it("transforms the state via a function", () => {
      const s = State.modify(n => n + 1);
      const [value, state] = s.run(10);
      assert.equal(value, undefined);
      assert.equal(state, 11);
    });

    it("applies transformation correctly", () => {
      const double = State.modify(n => n * 2);
      const [_, state] = double.run(5);
      assert.equal(state, 10);
    });
  });

  describe(".map", () => {
    it("transforms the produced value", () => {
      const s = State.of(10).map(n => n * 3);
      const [value, state] = s.run("s");
      assert.equal(value, 30);
      assert.equal(state, "s");
    });
  });

  describe(".flatMap", () => {
    it("chains state computations", () => {
      const s = State.get()
        .flatMap(n => State.set(n + 1))
        .flatMap(() => State.get());

      const [value, state] = s.run(10);
      assert.equal(value, 11);
      assert.equal(state, 11);
    });

    it("threads state through multiple steps", () => {
      const increment = State.get().flatMap(n => State.set(n + 1).map(() => n));

      const program = increment.flatMap(first => increment.map(second => [first, second]));

      const [values, finalState] = program.run(0);
      assert.deepEqual(values, [0, 1]);
      assert.equal(finalState, 2);
    });
  });

  describe(".tap", () => {
    it("runs a side-effect without modifying the computation", () => {
      const sideEffects = [];
      const s = State.of(42).tap(v => sideEffects.push(v));
      const [value, state] = s.run("s");
      assert.equal(value, 42);
      assert.equal(state, "s");
      assert.deepEqual(sideEffects, [42]);
    });
  });

  describe(".eval", () => {
    it("returns only the value, discarding final state", () => {
      const value = State.of(42).eval("ignored");
      assert.equal(value, 42);
    });

    it("discards state changes", () => {
      const value = State.modify(n => n + 100)
        .flatMap(() => State.of("result"))
        .eval(0);
      assert.equal(value, "result");
    });
  });

  describe(".exec", () => {
    it("returns only the final state, discarding the value", () => {
      const finalState = State.modify(n => n + 5).exec(10);
      assert.equal(finalState, 15);
    });

    it("discards the produced value", () => {
      const finalState = State.of("ignored").exec(42);
      assert.equal(finalState, 42);
    });
  });

  describe("composing multiple state operations", () => {
    it("counter increment example", () => {
      const counter = State.get().flatMap(n => State.set(n + 1).map(() => n));

      // Run three times to get three increments
      const program = counter.flatMap(a => counter.flatMap(b => counter.map(c => [a, b, c])));

      const [values, finalState] = program.run(0);
      assert.deepEqual(values, [0, 1, 2]);
      assert.equal(finalState, 3);
    });

    it("stack push/pop example", () => {
      const push = n => State.modify(s => [...s, n]);
      const pop = State.get().flatMap(s =>
        s.length > 0 ? State.set(s.slice(0, -1)).map(() => s[s.length - 1]) : State.of(undefined),
      );

      const program = push(1)
        .flatMap(() => push(2))
        .flatMap(() => push(3))
        .flatMap(() => pop);

      const [value, state] = program.run([]);
      assert.equal(value, 3);
      assert.deepEqual(state, [1, 2]);
    });
  });
});

// =============================================================================
// 5. Lens / LensOptional / Prism / Traversal
// =============================================================================

describe("Lens", () => {
  describe("Lens.prop", () => {
    it("gets a property from an object", () => {
      const name = Lens.prop()("name");
      assert.equal(name.get({ name: "Alice", age: 30 }), "Alice");
    });

    it("sets a property on an object immutably", () => {
      const name = Lens.prop()("name");
      const original = { name: "Alice", age: 30 };
      const updated = name.set("Bob")(original);
      assert.equal(updated.name, "Bob");
      assert.equal(updated.age, 30);
      assert.equal(original.name, "Alice"); // original unchanged
    });

    it("modifies a property on an object immutably", () => {
      const name = Lens.prop()("name");
      const result = name.modify(s => s.toUpperCase())({ name: "alice", age: 30 });
      assert.equal(result.name, "ALICE");
      assert.equal(result.age, 30);
    });

    it("works with nested objects via get", () => {
      const address = Lens.prop()("address");
      const obj = { address: { city: "Melbourne" } };
      assert.deepEqual(address.get(obj), { city: "Melbourne" });
    });
  });

  describe("Lens.compose", () => {
    it("composes two lenses for deep access", () => {
      const address = Lens.prop()("address");
      const city = Lens.prop()("city");
      const deepCity = address.compose(city);

      const user = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };

      assert.equal(deepCity.get(user), "Melbourne");
    });

    it("sets deeply nested property immutably", () => {
      const address = Lens.prop()("address");
      const city = Lens.prop()("city");
      const deepCity = address.compose(city);

      const user = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const updated = deepCity.set("Sydney")(user);

      assert.equal(updated.address.city, "Sydney");
      assert.equal(updated.address.zip, "3000");
      assert.equal(updated.name, "Alice");
      assert.equal(user.address.city, "Melbourne"); // original unchanged
    });

    it("modifies deeply nested property", () => {
      const address = Lens.prop()("address");
      const city = Lens.prop()("city");
      const deepCity = address.compose(city);

      const user = { name: "Alice", address: { city: "Melbourne", zip: "3000" } };
      const updated = deepCity.modify(c => c.toUpperCase())(user);

      assert.equal(updated.address.city, "MELBOURNE");
    });
  });

  describe("Lens.id", () => {
    it("identity lens gets the whole object", () => {
      const id = Lens.id();
      const obj = { a: 1, b: 2 };
      assert.deepEqual(id.get(obj), obj);
    });

    it("identity lens set replaces the whole object", () => {
      const id = Lens.id();
      const original = { a: 1 };
      const replacement = { a: 99 };
      const result = id.set(replacement)(original);
      assert.deepEqual(result, replacement);
    });

    it("identity lens modify transforms the whole object", () => {
      const id = Lens.id();
      const result = id.modify(obj => ({ ...obj, added: true }))({ x: 1 });
      assert.deepEqual(result, { x: 1, added: true });
    });

    it("composing with id is a no-op", () => {
      const name = Lens.prop()("name");
      const composed = Lens.id().compose(name);
      assert.equal(composed.get({ name: "test" }), "test");
    });
  });

  describe("Lens.from", () => {
    it("creates a custom lens from get/set", () => {
      const headLens = Lens.from(
        arr => arr[0],
        (value, arr) => [value, ...arr.slice(1)],
      );

      assert.equal(headLens.get([10, 20, 30]), 10);
      assert.deepEqual(headLens.set(99)([10, 20, 30]), [99, 20, 30]);
    });
  });
});

describe("LensOptional", () => {
  describe("LensOptional.index", () => {
    it("gets from a valid index", () => {
      const at1 = LensOptional.index(1);
      const result = at1.getOption([10, 20, 30]);
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), 20);
    });

    it("returns None for out-of-bounds index", () => {
      const at5 = LensOptional.index(5);
      const result = at5.getOption([10, 20, 30]);
      assert.equal(result.isNone, true);
    });

    it("returns None for empty array", () => {
      const at0 = LensOptional.index(0);
      assert.equal(at0.getOption([]).isNone, true);
    });

    it("supports negative indices", () => {
      const atLast = LensOptional.index(-1);
      const result = atLast.getOption([10, 20, 30]);
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), 30);
    });

    it("returns None for negative index beyond array length", () => {
      const atNeg5 = LensOptional.index(-5);
      assert.equal(atNeg5.getOption([10, 20]).isNone, true);
    });

    it("sets at a valid index immutably", () => {
      const at1 = LensOptional.index(1);
      const original = [10, 20, 30];
      const updated = at1.set(99)(original);
      assert.deepEqual(updated, [10, 99, 30]);
      assert.deepEqual(original, [10, 20, 30]); // original unchanged
    });

    it("returns original array when setting at out-of-bounds index", () => {
      const at5 = LensOptional.index(5);
      const original = [10, 20];
      const result = at5.set(99)(original);
      assert.deepEqual(result, [10, 20]);
    });

    it("modifies at a valid index", () => {
      const at0 = LensOptional.index(0);
      const result = at0.modify(n => n * 10)([5, 6, 7]);
      assert.deepEqual(result, [50, 6, 7]);
    });

    it("modify is a no-op for out-of-bounds index", () => {
      const at5 = LensOptional.index(5);
      const original = [1, 2];
      const result = at5.modify(n => n * 10)(original);
      assert.equal(result, original); // same reference
    });
  });

  describe("LensOptional.fromNullable", () => {
    it("returns Some when the field is present", () => {
      const bio = LensOptional.fromNullable()("bio");
      const user = { name: "Alice", bio: "Developer" };
      const result = bio.getOption(user);
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), "Developer");
    });

    it("returns None when the field is null", () => {
      const bio = LensOptional.fromNullable()("bio");
      const user = { name: "Alice", bio: null };
      assert.equal(bio.getOption(user).isNone, true);
    });

    it("returns None when the field is undefined", () => {
      const bio = LensOptional.fromNullable()("bio");
      const user = { name: "Alice", bio: undefined };
      assert.equal(bio.getOption(user).isNone, true);
    });

    it("sets a nullable field", () => {
      const bio = LensOptional.fromNullable()("bio");
      const updated = bio.set("New bio")({ name: "Alice", bio: null });
      assert.equal(updated.bio, "New bio");
      assert.equal(updated.name, "Alice");
    });
  });

  describe("LensOptional.compose", () => {
    it("composes two optionals", () => {
      const at0 = LensOptional.index(0);
      const at1 = LensOptional.index(1);

      // Access index 0 of outer, then index 1 of inner
      const composed = at0.compose(at1);

      const data = [
        [10, 20, 30],
        [40, 50],
      ];
      const result = composed.getOption(data);
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), 20);
    });

    it("returns None when first optional misses", () => {
      const at5 = LensOptional.index(5);
      const at0 = LensOptional.index(0);
      const composed = at5.compose(at0);

      assert.equal(composed.getOption([[1]]).isNone, true);
    });
  });

  describe("Lens.composeOptional", () => {
    it("composes a lens with an optional", () => {
      const items = Lens.prop()("items");
      const at0 = LensOptional.index(0);
      const firstItem = items.composeOptional(at0);

      const data = { items: [10, 20, 30] };
      assert.equal(firstItem.getOption(data).unwrap(), 10);
    });

    it("returns None when optional part misses", () => {
      const items = Lens.prop()("items");
      const at5 = LensOptional.index(5);
      const fifthItem = items.composeOptional(at5);

      const data = { items: [10, 20] };
      assert.equal(fifthItem.getOption(data).isNone, true);
    });
  });
});

describe("Prism", () => {
  describe("Prism.from", () => {
    it("getOption returns Some on matching variant", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      const result = strPrism.getOption("hello");
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), "hello");
    });

    it("getOption returns None on non-matching variant", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      assert.equal(strPrism.getOption(42).isNone, true);
    });

    it("reverseGet constructs the sum type", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      assert.equal(strPrism.reverseGet("test"), "test");
    });

    it("modify transforms matching values", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      assert.equal(strPrism.modify(s => s.toUpperCase())("hello"), "HELLO");
    });

    it("modify leaves non-matching values unchanged", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );
      assert.equal(strPrism.modify(s => s.toUpperCase())(42), 42);
    });

    it("works with Ok/Err prism on Result", () => {
      const okPrism = Prism.from(
        r => (r.isOk ? Some(r.value) : None),
        v => Ok(v),
      );

      assert.equal(okPrism.getOption(Ok(42)).unwrap(), 42);
      assert.equal(okPrism.getOption(Err("fail")).isNone, true);
      assert.equal(okPrism.reverseGet(10).isOk, true);
      assert.equal(okPrism.reverseGet(10).unwrap(), 10);
    });
  });

  describe("Prism.compose", () => {
    it("composes two prisms", () => {
      // First prism: extract string from string|number
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );

      // Second prism: extract first char from string (only if non-empty)
      const headPrism = Prism.from(
        s => (s.length > 0 ? Some(s[0]) : None),
        c => c,
      );

      const composed = strPrism.compose(headPrism);

      assert.equal(composed.getOption("hello").unwrap(), "h");
      assert.equal(composed.getOption("").isNone, true);
      assert.equal(composed.getOption(42).isNone, true);
      assert.equal(composed.reverseGet("A"), "A");
    });
  });

  describe("Prism.toOptional", () => {
    it("converts a prism to a LensOptional", () => {
      const strPrism = Prism.from(
        v => (typeof v === "string" ? Some(v) : None),
        s => s,
      );

      const opt = strPrism.toOptional();
      assert.equal(opt.getOption("hello").unwrap(), "hello");
      assert.equal(opt.getOption(42).isNone, true);
    });
  });

  describe("frozen instances", () => {
    it("prisms are frozen", () => {
      const p = Prism.from(
        v => Some(v),
        v => v,
      );
      assert.equal(Object.isFrozen(p), true);
    });
  });
});

describe("Traversal", () => {
  describe("Traversal.fromArray", () => {
    it("getAll returns all elements", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.getAll([1, 2, 3]), [1, 2, 3]);
    });

    it("getAll returns empty array for empty input", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.getAll([]), []);
    });

    it("modify transforms all elements", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.modify(n => n * 2)([1, 2, 3]), [2, 4, 6]);
    });

    it("modify on empty array returns empty array", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.modify(n => n * 2)([]), []);
    });

    it("set replaces all elements with the same value", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.set(0)([1, 2, 3]), [0, 0, 0]);
    });

    it("set on empty array returns empty array", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.set(99)([]), []);
    });

    it("works with string arrays", () => {
      const t = Traversal.fromArray();
      assert.deepEqual(t.modify(s => s.toUpperCase())(["a", "b", "c"]), ["A", "B", "C"]);
    });
  });

  describe("Traversal.from", () => {
    it("creates a custom traversal", () => {
      // Traverse over values of an object
      const t = Traversal.from(
        obj => Object.values(obj),
        (fn, obj) => {
          const result = {};
          for (const key of Object.keys(obj)) {
            result[key] = fn(obj[key]);
          }
          return result;
        },
      );

      assert.deepEqual(t.getAll({ a: 1, b: 2 }), [1, 2]);
      assert.deepEqual(t.modify(n => n * 10)({ a: 1, b: 2 }), { a: 10, b: 20 });
      assert.deepEqual(t.set(0)({ a: 1, b: 2 }), { a: 0, b: 0 });
    });
  });

  describe("frozen instances", () => {
    it("traversals are frozen", () => {
      const t = Traversal.fromArray();
      assert.equal(Object.isFrozen(t), true);
    });
  });
});

// =============================================================================
// 6. Result.traverse / Result.sequence / Option.traverse / Option.sequence
// =============================================================================

describe("Result.traverse", () => {
  it("collects all successes", () => {
    const result = Result.traverse([1, 2, 3], n => Ok(n * 2));
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [2, 4, 6]);
  });

  it("short-circuits on the first failure", () => {
    let count = 0;
    const result = Result.traverse([1, -2, 3, -4], n => {
      count++;
      return n > 0 ? Ok(n) : Err(`negative: ${n}`);
    });
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "negative: -2");
    assert.equal(count, 2); // stopped after the second element
  });

  it("returns Ok with empty array for empty input", () => {
    const result = Result.traverse([], n => Ok(n));
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("single element success", () => {
    const result = Result.traverse([42], n => Ok(n));
    assert.deepEqual(result.unwrap(), [42]);
  });

  it("single element failure", () => {
    const result = Result.traverse([42], () => Err("fail"));
    assert.equal(result.isErr, true);
  });
});

describe("Result.sequence (alias for collect)", () => {
  it("collects all Ok results", () => {
    const result = Result.sequence([Ok(1), Ok(2), Ok(3)]);
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [1, 2, 3]);
  });

  it("short-circuits on first Err", () => {
    const result = Result.sequence([Ok(1), Err("bad"), Ok(3)]);
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "bad");
  });

  it("handles empty array", () => {
    const result = Result.sequence([]);
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("single Err", () => {
    const result = Result.sequence([Err("only error")]);
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "only error");
  });
});

describe("Result.fromNullable", () => {
  it("non-null value returns Ok", () => {
    const result = Result.fromNullable(42, () => "was null");
    assert.equal(result.isOk, true);
    assert.equal(result.value, 42);
  });

  it("null returns Err", () => {
    const result = Result.fromNullable(null, () => "was null");
    assert.equal(result.isErr, true);
    assert.equal(result.error, "was null");
  });

  it("undefined returns Err", () => {
    const result = Result.fromNullable(undefined, () => "missing");
    assert.equal(result.isErr, true);
    assert.equal(result.error, "missing");
  });

  it("falsy values (0, empty string, false) return Ok", () => {
    assert.equal(Result.fromNullable(0, () => "err").isOk, true);
    assert.equal(Result.fromNullable("", () => "err").isOk, true);
    assert.equal(Result.fromNullable(false, () => "err").isOk, true);
  });
});

describe("Result.partition", () => {
  it("separates Ok and Err values", () => {
    const results = [Ok(1), Err("a"), Ok(2), Err("b"), Ok(3)];
    const { ok, err } = Result.partition(results);
    assert.deepEqual(ok, [1, 2, 3]);
    assert.deepEqual(err, ["a", "b"]);
  });

  it("all Ok returns empty err array", () => {
    const { ok, err } = Result.partition([Ok(1), Ok(2)]);
    assert.deepEqual(ok, [1, 2]);
    assert.deepEqual(err, []);
  });

  it("all Err returns empty ok array", () => {
    const { ok, err } = Result.partition([Err("x"), Err("y")]);
    assert.deepEqual(ok, []);
    assert.deepEqual(err, ["x", "y"]);
  });

  it("empty array returns empty groups", () => {
    const { ok, err } = Result.partition([]);
    assert.deepEqual(ok, []);
    assert.deepEqual(err, []);
  });
});

describe("Option.partition", () => {
  it("separates Some and None values", () => {
    const options = [Some(1), None, Some(2), None, Some(3)];
    const { some, none } = Option.partition(options);
    assert.deepEqual(some, [1, 2, 3]);
    assert.equal(none, 2);
  });

  it("all Some returns zero none count", () => {
    const { some, none } = Option.partition([Some("a"), Some("b")]);
    assert.deepEqual(some, ["a", "b"]);
    assert.equal(none, 0);
  });

  it("all None returns empty some array", () => {
    const { some, none } = Option.partition([None, None, None]);
    assert.deepEqual(some, []);
    assert.equal(none, 3);
  });

  it("empty array returns empty result", () => {
    const { some, none } = Option.partition([]);
    assert.deepEqual(some, []);
    assert.equal(none, 0);
  });
});

describe("Option.traverse", () => {
  it("collects all present values", () => {
    const result = Option.traverse([1, 2, 3], n => Some(n * 10));
    assert.equal(result.isSome, true);
    assert.deepEqual(result.unwrap(), [10, 20, 30]);
  });

  it("short-circuits on first None", () => {
    let count = 0;
    const result = Option.traverse([1, 2, 3], n => {
      count++;
      return n === 2 ? None : Some(n);
    });
    assert.equal(result.isNone, true);
    assert.equal(count, 2); // stopped after second element
  });

  it("returns Some with empty array for empty input", () => {
    const result = Option.traverse([], () => None);
    assert.equal(result.isSome, true);
    assert.deepEqual(result.unwrap(), []);
  });
});

describe("Option.sequence (alias for collect)", () => {
  it("collects all Some values", () => {
    const result = Option.sequence([Some(1), Some(2), Some(3)]);
    assert.equal(result.isSome, true);
    assert.deepEqual(result.unwrap(), [1, 2, 3]);
  });

  it("short-circuits on first None", () => {
    const result = Option.sequence([Some(1), None, Some(3)]);
    assert.equal(result.isNone, true);
  });

  it("handles empty array", () => {
    const result = Option.sequence([]);
    assert.equal(result.isSome, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("single None", () => {
    const result = Option.sequence([None]);
    assert.equal(result.isNone, true);
  });
});

// =============================================================================
// 7. Task.traverse / Task.sequence / Task.ap
// =============================================================================

describe("Task.traverse", () => {
  it("runs all items in parallel and collects results", async () => {
    const result = await Task.traverse([1, 2, 3], n => Task(async () => Ok(n * 10))).run();

    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [10, 20, 30]);
  });

  it("short-circuits on first error (collects after parallel execution)", async () => {
    const result = await Task.traverse([1, -2, 3], n =>
      Task(async () => (n > 0 ? Ok(n) : Err(`negative: ${n}`))),
    ).run();

    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "negative: -2");
  });

  it("handles empty array", async () => {
    const result = await Task.traverse([], n => Task.of(n)).run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("all tasks execute (parallel semantics)", async () => {
    const executed = [];
    await Task.traverse([1, 2, 3], n =>
      Task(async () => {
        executed.push(n);
        return Ok(n);
      }),
    ).run();

    // All three should have executed since they run in parallel
    assert.equal(executed.length, 3);
  });
});

describe("Task.sequence", () => {
  it("runs all tasks in parallel and collects Ok results", async () => {
    const tasks = [Task.of(1), Task.of(2), Task.of(3)];
    const result = await Task.sequence(tasks).run();

    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [1, 2, 3]);
  });

  it("short-circuits when any task returns Err", async () => {
    const tasks = [Task.of(1), Task(async () => Err("fail")), Task.of(3)];
    const result = await Task.sequence(tasks).run();

    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "fail");
  });

  it("handles empty task list", async () => {
    const result = await Task.sequence([]).run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });
});

describe("Task.ap", () => {
  it("applies a function task to a value task (both Ok)", async () => {
    const fnTask = Task.of(n => n * 2);
    const argTask = Task.of(21);
    const result = await Task.ap(fnTask, argTask).run();

    assert.equal(result.isOk, true);
    assert.equal(result.unwrap(), 42);
  });

  it("returns Err when function task fails", async () => {
    const fnTask = Task(async () => Err("fn failed"));
    const argTask = Task.of(21);
    const result = await Task.ap(fnTask, argTask).run();

    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "fn failed");
  });

  it("returns Err when argument task fails", async () => {
    const fnTask = Task.of(n => n * 2);
    const argTask = Task(async () => Err("arg failed"));
    const result = await Task.ap(fnTask, argTask).run();

    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), "arg failed");
  });

  it("returns first Err when both tasks fail", async () => {
    const fnTask = Task(async () => Err("fn failed"));
    const argTask = Task(async () => Err("arg failed"));
    const result = await Task.ap(fnTask, argTask).run();

    assert.equal(result.isErr, true);
    // fn is checked first
    assert.equal(result.unwrapErr(), "fn failed");
  });

  it("runs both tasks in parallel", async () => {
    const executed = [];
    const fnTask = Task(async () => {
      executed.push("fn");
      return Ok(n => n + 1);
    });
    const argTask = Task(async () => {
      executed.push("arg");
      return Ok(10);
    });

    const result = await Task.ap(fnTask, argTask).run();
    assert.equal(result.unwrap(), 11);
    assert.equal(executed.length, 2);
  });
});

// =============================================================================
// 8. List.sortByOrd / List.uniqBy / List.groupBy
// =============================================================================

describe("List.sortByOrd", () => {
  it("sorts using Ord.number in ascending order", () => {
    const list = List([3, 1, 4, 1, 5, 9, 2, 6]);
    const sorted = list.sortByOrd(Ord.number);
    assert.deepEqual([...sorted], [1, 1, 2, 3, 4, 5, 6, 9]);
  });

  it("sorts in descending order with Ord.reverse", () => {
    const list = List([3, 1, 4, 1, 5]);
    const sorted = list.sortByOrd(Ord.reverse(Ord.number));
    assert.deepEqual([...sorted], [5, 4, 3, 1, 1]);
  });

  it("does not mutate the original list", () => {
    const list = List([3, 1, 2]);
    const sorted = list.sortByOrd(Ord.number);
    assert.deepEqual([...list], [3, 1, 2]); // original unchanged
    assert.deepEqual([...sorted], [1, 2, 3]);
  });

  it("handles empty list", () => {
    const list = List([]);
    const sorted = list.sortByOrd(Ord.number);
    assert.deepEqual([...sorted], []);
  });

  it("handles single element list", () => {
    const list = List([42]);
    const sorted = list.sortByOrd(Ord.number);
    assert.deepEqual([...sorted], [42]);
  });

  it("sorts strings", () => {
    const list = List(["banana", "apple", "cherry"]);
    const sorted = list.sortByOrd(Ord.string);
    assert.deepEqual([...sorted], ["apple", "banana", "cherry"]);
  });

  it("sorts by derived ordering", () => {
    const byAge = Ord.contramap(Ord.number, u => u.age);
    const list = List([
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 20 },
      { name: "Bob", age: 25 },
    ]);

    const sorted = list.sortByOrd(byAge);
    assert.equal(sorted.at(0).unwrap().name, "Alice");
    assert.equal(sorted.at(1).unwrap().name, "Bob");
    assert.equal(sorted.at(2).unwrap().name, "Charlie");
  });
});

describe("List.uniqBy", () => {
  it("deduplicates using Eq.number", () => {
    const list = List([1, 2, 3, 2, 1, 4, 3]);
    const unique = list.uniqBy(Eq.number);
    assert.deepEqual([...unique], [1, 2, 3, 4]);
  });

  it("preserves first occurrence", () => {
    const eqById = Eq.contramap(Eq.number, u => u.id);
    const list = List([
      { id: 1, name: "first" },
      { id: 2, name: "second" },
      { id: 1, name: "duplicate" },
    ]);

    const unique = list.uniqBy(eqById);
    assert.equal(unique.length, 2);
    assert.equal(unique.at(0).unwrap().name, "first"); // first occurrence kept
    assert.equal(unique.at(1).unwrap().name, "second");
  });

  it("handles empty list", () => {
    const list = List([]);
    const unique = list.uniqBy(Eq.number);
    assert.deepEqual([...unique], []);
  });

  it("handles all-unique list", () => {
    const list = List([1, 2, 3, 4]);
    const unique = list.uniqBy(Eq.number);
    assert.deepEqual([...unique], [1, 2, 3, 4]);
  });

  it("handles all-same list", () => {
    const list = List([5, 5, 5, 5]);
    const unique = list.uniqBy(Eq.number);
    assert.deepEqual([...unique], [5]);
  });

  it("deduplicates strings", () => {
    const list = List(["a", "b", "a", "c", "b"]);
    const unique = list.uniqBy(Eq.string);
    assert.deepEqual([...unique], ["a", "b", "c"]);
  });

  it("uses custom Eq for deduplication", () => {
    // Case-insensitive string equality
    const eqCaseInsensitive = Eq((a, b) => a.toLowerCase() === b.toLowerCase());
    const list = List(["Hello", "HELLO", "hello", "World"]);
    const unique = list.uniqBy(eqCaseInsensitive);
    assert.equal(unique.length, 2);
    assert.equal(unique.at(0).unwrap(), "Hello"); // first occurrence
    assert.equal(unique.at(1).unwrap(), "World");
  });

  it("does not mutate the original list", () => {
    const list = List([1, 2, 1]);
    const unique = list.uniqBy(Eq.number);
    assert.deepEqual([...list], [1, 2, 1]);
    assert.deepEqual([...unique], [1, 2]);
  });
});

describe("List.groupBy", () => {
  it("groups elements by a key function", () => {
    const list = List([1, 2, 3, 4, 5, 6]);
    const groups = list.groupBy(n => (n % 2 === 0 ? "even" : "odd"));

    assert.deepEqual([...groups.even], [2, 4, 6]);
    assert.deepEqual([...groups.odd], [1, 3, 5]);
  });

  it("returns correct record of lists", () => {
    const list = List(["apple", "avocado", "banana", "blueberry", "cherry"]);
    const grouped = list.groupBy(s => s[0]);

    assert.deepEqual([...grouped["a"]], ["apple", "avocado"]);
    assert.deepEqual([...grouped["b"]], ["banana", "blueberry"]);
    assert.deepEqual([...grouped["c"]], ["cherry"]);
  });

  it("handles empty list", () => {
    const list = List([]);
    const groups = list.groupBy(() => "any");
    assert.deepEqual(Object.keys(groups), []);
  });

  it("single group for all-same key", () => {
    const list = List([1, 2, 3]);
    const groups = list.groupBy(() => "all");
    assert.deepEqual([...groups["all"]], [1, 2, 3]);
  });

  it("each element in its own group", () => {
    const list = List(["a", "b", "c"]);
    const groups = list.groupBy(s => s);
    assert.deepEqual([...groups["a"]], ["a"]);
    assert.deepEqual([...groups["b"]], ["b"]);
    assert.deepEqual([...groups["c"]], ["c"]);
  });

  it("preserves order within groups", () => {
    const list = List([
      { dept: "engineering", name: "Alice" },
      { dept: "sales", name: "Bob" },
      { dept: "engineering", name: "Charlie" },
      { dept: "sales", name: "Diana" },
    ]);

    const groups = list.groupBy(u => u.dept);
    const eng = groups["engineering"];
    const sales = groups["sales"];

    assert.equal(eng.at(0).unwrap().name, "Alice");
    assert.equal(eng.at(1).unwrap().name, "Charlie");
    assert.equal(sales.at(0).unwrap().name, "Bob");
    assert.equal(sales.at(1).unwrap().name, "Diana");
  });

  it("result lists are immutable", () => {
    const list = List([1, 2, 3]);
    const groups = list.groupBy(n => (n % 2 === 0 ? "even" : "odd"));

    assert.equal(groups.odd.$immutable, true);
    assert.equal(groups.even.$immutable, true);
  });
});

// =============================================================================
// Iso
// =============================================================================

describe("Iso", () => {
  // Celsius <-> Fahrenheit: a classic lossless conversion
  const celsiusToFahrenheit = Iso.from(
    c => (c * 9) / 5 + 32,
    f => ((f - 32) * 5) / 9,
  );

  describe("get / reverseGet roundtrip", () => {
    it("get converts S to A", () => {
      assert.equal(celsiusToFahrenheit.get(0), 32);
      assert.equal(celsiusToFahrenheit.get(100), 212);
    });

    it("reverseGet converts A back to S", () => {
      assert.equal(celsiusToFahrenheit.reverseGet(32), 0);
      assert.equal(celsiusToFahrenheit.reverseGet(212), 100);
    });

    it("roundtrip: reverseGet(get(s)) === s", () => {
      const value = 37;
      assert.equal(celsiusToFahrenheit.reverseGet(celsiusToFahrenheit.get(value)), value);
    });

    it("roundtrip: get(reverseGet(a)) === a", () => {
      const value = 98.6;
      const result = celsiusToFahrenheit.get(celsiusToFahrenheit.reverseGet(value));
      assert.ok(Math.abs(result - value) < 1e-10);
    });
  });

  describe("modify", () => {
    it("applies transformation through the iso", () => {
      // Double the fahrenheit value of 0C (32F) -> 64F -> back to celsius
      const result = celsiusToFahrenheit.modify(f => f * 2)(0);
      // 0C -> 32F -> 64F -> ~17.78C
      const expected = ((64 - 32) * 5) / 9;
      assert.ok(Math.abs(result - expected) < 1e-10);
    });

    it("identity function returns same value", () => {
      assert.equal(celsiusToFahrenheit.modify(x => x)(100), 100);
    });
  });

  describe("compose", () => {
    it("chains two Isos", () => {
      // string <-> number[] (char codes)
      const strToCharCodes = Iso.from(
        s => Array.from(s).map(c => c.charCodeAt(0)),
        codes => codes.map(c => String.fromCharCode(c)).join(""),
      );

      // number[] <-> string (JSON)
      const codesToJson = Iso.from(
        codes => JSON.stringify(codes),
        json => JSON.parse(json),
      );

      const composed = strToCharCodes.compose(codesToJson);

      const json = composed.get("AB");
      assert.equal(json, "[65,66]");

      const back = composed.reverseGet("[65,66]");
      assert.equal(back, "AB");
    });

    it("composed roundtrip holds", () => {
      const double = Iso.from(
        n => n * 2,
        n => n / 2,
      );
      const addTen = Iso.from(
        n => n + 10,
        n => n - 10,
      );
      const composed = double.compose(addTen);

      assert.equal(composed.get(5), 20); // 5*2=10, 10+10=20
      assert.equal(composed.reverseGet(20), 5); // 20-10=10, 10/2=5
    });
  });

  describe("reverse", () => {
    it("swaps get and reverseGet", () => {
      const reversed = celsiusToFahrenheit.reverse();

      // reversed.get is the original reverseGet (fahrenheit -> celsius)
      assert.equal(reversed.get(32), 0);
      assert.equal(reversed.get(212), 100);

      // reversed.reverseGet is the original get (celsius -> fahrenheit)
      assert.equal(reversed.reverseGet(0), 32);
      assert.equal(reversed.reverseGet(100), 212);
    });

    it("double reverse is equivalent to original", () => {
      const doubleReversed = celsiusToFahrenheit.reverse().reverse();
      assert.equal(doubleReversed.get(100), 212);
      assert.equal(doubleReversed.reverseGet(212), 100);
    });
  });

  describe("toLens", () => {
    it("returns a working Lens", () => {
      const lens = celsiusToFahrenheit.toLens();

      assert.equal(lens.get(0), 32);
      assert.equal(lens.get(100), 212);
    });

    it("lens.set replaces the value through reverseGet", () => {
      const lens = celsiusToFahrenheit.toLens();

      // set fahrenheit to 212, get back celsius
      const result = lens.set(212)(0);
      assert.equal(result, 100);
    });

    it("lens.modify works", () => {
      const lens = celsiusToFahrenheit.toLens();

      // 0C -> 32F, double -> 64F -> back to celsius
      const result = lens.modify(f => f * 2)(0);
      const expected = ((64 - 32) * 5) / 9;
      assert.ok(Math.abs(result - expected) < 1e-10);
    });
  });

  describe("toPrism", () => {
    it("returns a working Prism", () => {
      const prism = celsiusToFahrenheit.toPrism();

      const result = prism.getOption(100);
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), 212);
    });

    it("reverseGet constructs the source", () => {
      const prism = celsiusToFahrenheit.toPrism();

      assert.equal(prism.reverseGet(212), 100);
    });

    it("prism.modify works", () => {
      const prism = celsiusToFahrenheit.toPrism();

      const result = prism.modify(f => f + 1)(0);
      // 0C -> 32F -> 33F -> back to celsius
      const expected = ((33 - 32) * 5) / 9;
      assert.ok(Math.abs(result - expected) < 1e-10);
    });
  });

  describe("Iso.id", () => {
    it("get returns the same value", () => {
      const id = Iso.id();
      assert.equal(id.get(42), 42);
      assert.equal(id.get("hello"), "hello");
    });

    it("reverseGet returns the same value", () => {
      const id = Iso.id();
      assert.equal(id.reverseGet(42), 42);
    });

    it("modify applies fn directly", () => {
      const id = Iso.id();
      assert.equal(id.modify(n => n + 1)(41), 42);
    });

    it("reverse of id is still id", () => {
      const id = Iso.id();
      const rev = id.reverse();
      assert.equal(rev.get(42), 42);
      assert.equal(rev.reverseGet(42), 42);
    });
  });

  describe("frozen instances", () => {
    it("isos are frozen", () => {
      const iso = Iso.from(
        n => n.toString(),
        s => Number(s),
      );
      assert.equal(Object.isFrozen(iso), true);
    });

    it("composed isos are frozen", () => {
      const a = Iso.from(
        n => n * 2,
        n => n / 2,
      );
      const b = Iso.from(
        n => n + 1,
        n => n - 1,
      );
      assert.equal(Object.isFrozen(a.compose(b)), true);
    });

    it("reversed isos are frozen", () => {
      const iso = Iso.from(
        n => n * 2,
        n => n / 2,
      );
      assert.equal(Object.isFrozen(iso.reverse()), true);
    });
  });
});

// =============================================================================
// ErrType cause chain
// =============================================================================

describe("ErrType cause chain", () => {
  const NotFound = ErrType("NotFound");
  const DbError = ErrType("DbError");

  it("creates error with cause from a native Error", () => {
    const original = new Error("connection refused");
    const err = NotFound("User not found", { cause: original });
    assert.equal(err.cause, original);
    assert.equal(err.message, "User not found");
    assert.equal(err.tag, "NotFound");
  });

  it("cause is preserved on the frozen instance", () => {
    const original = new TypeError("bad input");
    const err = NotFound("gone", { cause: original });
    assert.equal(Object.isFrozen(err), true);
    assert.equal(err.cause, original);
  });

  it("cause defaults to undefined when not provided", () => {
    const err = NotFound("gone");
    assert.equal(err.cause, undefined);
  });

  it("toString appends cause when present", () => {
    const original = new Error("timeout");
    const err = NotFound("User not found", { cause: original });
    const str = err.toString();
    assert.equal(str.startsWith("NotFound(NOT_FOUND): User not found [caused by: "), true);
    assert.equal(str.includes("timeout"), true);
  });

  it("toString omits cause suffix when cause is undefined", () => {
    const err = NotFound("User not found");
    assert.equal(err.toString(), "NotFound(NOT_FOUND): User not found");
  });

  it("toJSON includes cause when it is a native Error", () => {
    const original = new Error("disk full");
    const err = NotFound("write failed", { cause: original });
    const json = err.toJSON();
    assert.deepEqual(json.cause, { name: "Error", message: "disk full" });
  });

  it("toJSON includes cause as-is for primitive values", () => {
    const err = NotFound("failed", { cause: "some reason" });
    const json = err.toJSON();
    assert.equal(json.cause, "some reason");
  });

  it("toJSON omits cause key when cause is undefined", () => {
    const err = NotFound("gone");
    const json = err.toJSON();
    assert.equal("cause" in json, false);
  });

  it("toJSON serializes ErrType cause via its own toJSON", () => {
    const inner = DbError("connection lost");
    const outer = NotFound("User not found", { cause: inner });
    const json = outer.toJSON();
    assert.equal(json.cause.tag, "DbError");
    assert.equal(json.cause.code, "DB_ERROR");
    assert.equal(json.cause.message, "connection lost");
    assert.equal("stack" in json.cause, false);
  });

  it("backward compatibility: plain metadata object still works", () => {
    const err = NotFound("User not found", { userId: "u_123", role: "admin" });
    assert.deepEqual(err.metadata, { userId: "u_123", role: "admin" });
    assert.equal(err.cause, undefined);
    assert.equal(err.tag, "NotFound");
    assert.equal(err.message, "User not found");
  });

  it("backward compatibility: metadata is deep frozen", () => {
    const err = NotFound("gone", { nested: { value: 1 } });
    assert.throws(() => {
      err.metadata.nested.value = 2;
    }, TypeError);
  });

  it("options-style: metadata and cause together", () => {
    const original = new Error("timeout");
    const err = NotFound("User not found", {
      cause: original,
      metadata: { userId: "u_456" },
    });
    assert.equal(err.cause, original);
    assert.deepEqual(err.metadata, { userId: "u_456" });
  });

  it("nested causes: ErrType wrapping ErrType wrapping Error", () => {
    const root = new Error("ECONNREFUSED");
    const mid = DbError("query failed", { cause: root });
    const outer = NotFound("User not found", { cause: mid });

    // Outer cause is the mid ErrType
    assert.equal(outer.cause, mid);
    assert.equal(outer.cause.tag, "DbError");

    // Mid cause is the root Error
    assert.equal(mid.cause, root);
    assert.equal(mid.cause.message, "ECONNREFUSED");

    // toString chain
    assert.equal(outer.toString().includes("[caused by: "), true);
    assert.equal(mid.toString().includes("[caused by: "), true);

    // toJSON chain
    const outerJson = outer.toJSON();
    assert.equal(outerJson.cause.tag, "DbError");
    assert.deepEqual(outerJson.cause.cause, { name: "Error", message: "ECONNREFUSED" });
  });

  it("ErrType.is() still works with cause field present", () => {
    const err = NotFound("gone", { cause: new Error("x") });
    assert.equal(ErrType.is(err), true);
    assert.equal(NotFound.is(err), true);
  });

  it("Constructor.is() still rejects wrong error types with cause", () => {
    const Forbidden = ErrType("Forbidden");
    const err = NotFound("gone", { cause: new Error("x") });
    assert.equal(Forbidden.is(err), false);
  });
});
