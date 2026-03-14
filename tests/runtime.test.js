/**
 * runtime.test.js - Runtime correctness tests.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/runtime.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  Record, List, Schema,
  Ok, Err, Some, None, Result, Option,
  match, tryCatch,
  pipe, flow, Lazy, Task,
  isImmutable,
  TaggedError, isTaggedError,
} = await import('../dist/index.js');

// ═══════════════════════════════════════════════════════════════════════════════
// Record
// ═══════════════════════════════════════════════════════════════════════════════

describe('Record', () => {
  const user = Record({
    name: 'John Doe', age: 21,
    address: { city: 'New York', geo: { lat: -33.87 } },
    tags: ['fp', 'ts'],
  });

  it('reads shallow properties', () => {
    assert.equal(user.name, 'John Doe');
    assert.equal(user.age, 21);
  });

  it('reads nested properties', () => {
    assert.equal(user.address.city, 'New York');
    assert.equal(user.address.geo.lat, -33.87);
  });

  it('nested objects are full Records', () => {
    assert.equal(user.address.$immutable, true);
    assert.equal(typeof user.address.set, 'function');
    assert.equal(typeof user.address.update, 'function');
    assert.equal(typeof user.address.produce, 'function');
  });

  it('blocks mutation at runtime', () => {
    assert.throws(() => { user.name = 'X'; }, TypeError);
    assert.throws(() => { user.address.city = 'X'; }, TypeError);
  });

  it('set() returns new Record', () => {
    const moved = user.set(u => u.address.city, 'San Francisco');
    assert.equal(moved.address.city, 'San Francisco');
    assert.equal(user.address.city, 'New York');
  });

  it('update() transforms value', () => {
    const upper = user.update(u => u.name, n => n.toUpperCase());
    assert.equal(upper.name, 'JOHN DOE');
    assert.equal(user.name, 'John Doe');
  });

  it('produce() batch mutations', () => {
    const produced = user.produce(d => {
      d.name = 'Jack Doe';
      d.address.city = 'Melbourne';
    });
    assert.equal(produced.name, 'Jack Doe');
    assert.equal(produced.address.city, 'Melbourne');
    assert.equal(user.name, 'John Doe');
    assert.equal(user.address.city, 'New York');
  });

  it('merge() shallow merges', () => {
    const merged = user.merge({ age: 99 });
    assert.equal(merged.age, 99);
    assert.equal(merged.name, 'John Doe');
    assert.equal(user.age, 21);
  });

  it('at() returns Option', () => {
    assert.equal(user.at(u => u.name).isSome, true);
    assert.equal(user.at(u => u.name).unwrap(), 'John Doe');

    const withNull = Record({ x: null });
    assert.equal(withNull.at(r => r.x).isNone, true);
  });

  it('equals() structural comparison', () => {
    const a = Record({ x: 1, y: { z: 2 } });
    const b = Record({ x: 1, y: { z: 2 } });
    const c = Record({ x: 1, y: { z: 3 } });
    assert.equal(a.equals(b), true);
    assert.equal(a.equals(c), false);
  });

  it('toMutable() deep clones', () => {
    const mut = user.toMutable();
    mut.name = 'Mutable';
    assert.equal(mut.name, 'Mutable');
    assert.equal(user.name, 'John Doe');
  });

  it('toJSON() returns raw data', () => {
    const json = user.toJSON();
    assert.equal(json.name, 'John Doe');
  });

  it('$immutable brand', () => {
    assert.equal(user.$immutable, true);
    assert.equal(isImmutable(user), true);
    assert.equal(isImmutable({}), false);
  });

  it('Record.clone() defensive copy', () => {
    const source = { name: 'External' };
    const safe = Record.clone(source);
    source.name = 'Mutated';
    assert.equal(safe.name, 'External');
  });

  it('Record.clone() deep copies nested objects', () => {
    const source = { data: { value: 'original', nested: { x: 1 } } };
    const safe = Record.clone(source);
    source.data.value = 'mutated';
    source.data.nested.x = 999;
    assert.equal(safe.data.value, 'original');
    assert.equal(safe.data.nested.x, 1);
  });

  it('child proxy cache identity', () => {
    assert.equal(user.address, user.address);
    assert.equal(user.address.geo, user.address.geo);
  });

  it('empty Record', () => {
    const empty = Record({});
    assert.equal(empty.$immutable, true);
    assert.deepEqual(empty.toJSON(), {});
    assert.equal(empty.equals(Record({})), true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// List
// ═══════════════════════════════════════════════════════════════════════════════

describe('List', () => {
  const nums = List([3, 1, 4, 1, 5]);

  it('index access', () => {
    assert.equal(nums[0], 3);
    assert.equal(nums[4], 5);
    assert.equal(nums.length, 5);
  });

  it('blocks mutation', () => {
    assert.throws(() => { nums[0] = 99; }, TypeError);
  });

  it('append/prepend', () => {
    assert.deepEqual([...nums.append(9)], [3, 1, 4, 1, 5, 9]);
    assert.deepEqual([...nums.prepend(0)], [0, 3, 1, 4, 1, 5]);
    assert.equal(nums.length, 5);
  });

  it('setAt/updateAt/removeAt', () => {
    assert.equal(nums.setAt(0, 99)[0], 99);
    assert.equal(nums.updateAt(0, n => n * 10)[0], 30);
    assert.equal(nums.removeAt(0).length, 4);
  });

  it('map/filter/reduce', () => {
    assert.deepEqual([...nums.map(n => n * 2)], [6, 2, 8, 2, 10]);
    assert.deepEqual([...nums.filter(n => n > 3)], [4, 5]);
    assert.equal(nums.reduce((a, n) => a + n, 0), 14);
  });

  it('find/findIndex return Option', () => {
    assert.equal(nums.find(n => n === 4).isSome, true);
    assert.equal(nums.find(n => n === 4).unwrap(), 4);
    assert.equal(nums.find(n => n === 99).isNone, true);
    assert.equal(nums.findIndex(n => n === 4).unwrap(), 2);
  });

  it('at/first/last return Option', () => {
    assert.equal(nums.at(0).unwrap(), 3);
    assert.equal(nums.at(-1).unwrap(), 5);
    assert.equal(nums.at(99).isNone, true);
    assert.equal(nums.first().unwrap(), 3);
    assert.equal(nums.last().unwrap(), 5);
    assert.equal(List([]).first().isNone, true);
  });

  it('sortBy', () => {
    assert.deepEqual([...nums.sortBy((a, b) => a - b)], [1, 1, 3, 4, 5]);
    assert.equal(nums[0], 3); // original unchanged
  });

  it('concat/slice/flatMap', () => {
    assert.deepEqual([...nums.slice(0, 2)], [3, 1]);
    assert.deepEqual([...nums.concat([6, 7])], [3, 1, 4, 1, 5, 6, 7]);
    assert.deepEqual([...nums.flatMap(n => [n, n])], [3, 3, 1, 1, 4, 4, 1, 1, 5, 5]);
  });

  it('equals', () => {
    assert.equal(List([1, 2]).equals(List([1, 2])), true);
    assert.equal(List([1, 2]).equals(List([1, 3])), false);
  });

  it('nested records in lists', () => {
    const users = List([{ id: 'u1', name: 'John Doe' }, { id: 'u2', name: 'Gislaine' }]);
    assert.equal(users[0].name, 'John Doe');
    assert.equal(users[0].$immutable, true);
  });

  it('empty List', () => {
    const empty = List([]);
    assert.equal(empty.length, 0);
    assert.equal(empty.first().isNone, true);
    assert.equal(empty.last().isNone, true);
    assert.equal(empty.find(() => true).isNone, true);
    assert.deepEqual([...empty], []);
    assert.equal(empty.equals(List([])), true);
  });

  it('toMutable() deep clones', () => {
    const items = List([{ x: 1 }, { x: 2 }]);
    const mut = items.toMutable();
    mut[0].x = 99;
    assert.equal(items[0].x, 1);
  });

  it('List.clone() defensive copy', () => {
    const source = [{ id: 1 }];
    const safe = List.clone(source);
    source[0].id = 999;
    assert.equal(safe[0].id, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Result
// ═══════════════════════════════════════════════════════════════════════════════

describe('Result', () => {
  it('Ok/Err construction', () => {
    assert.equal(Ok(42).tag, 'Ok');
    assert.equal(Ok(42).value, 42);
    assert.equal(Ok(42).isOk, true);
    assert.equal(Ok(42).isErr, false);
    assert.equal(Err('fail').tag, 'Err');
    assert.equal(Err('fail').error, 'fail');
    assert.equal(Err('fail').isErr, true);
  });

  it('map/mapErr', () => {
    assert.equal(Ok(2).map(n => n * 3).unwrap(), 6);
    assert.equal(Err('x').map(() => 99).isErr, true);
    assert.equal(Err('x').mapErr(e => e.toUpperCase()).unwrapErr(), 'X');
  });

  it('flatMap', () => {
    assert.equal(Ok(2).flatMap(n => Ok(n * 3)).unwrap(), 6);
    assert.equal(Ok(2).flatMap(() => Err('nope')).isErr, true);
    assert.equal(Err('x').flatMap(() => Ok(99)).isErr, true);
  });

  it('tap/tapErr', () => {
    let tapped = 0;
    Ok(42).tap(v => { tapped = v; });
    assert.equal(tapped, 42);
    Err('x').tapErr(e => { tapped = e.length; });
    assert.equal(tapped, 1);

    // tap on Err is no-op
    let didTap = false;
    Err('x').tap(() => { didTap = true; });
    assert.equal(didTap, false);

    // tapErr on Ok is no-op
    let didTapErr = false;
    Ok(42).tapErr(() => { didTapErr = true; });
    assert.equal(didTapErr, false);
  });

  it('unwrap/unwrapOr/unwrapOrElse', () => {
    assert.equal(Ok(42).unwrap(), 42);
    assert.throws(() => Err('x').unwrap(), TypeError);
    assert.equal(Ok(42).unwrapOr(0), 42);
    assert.equal(Err('x').unwrapOr(0), 0);
    assert.equal(Err('x').unwrapOrElse(e => e.length), 1);
  });

  it('unwrapErr throws on Ok', () => {
    assert.throws(() => Ok(42).unwrapErr(), TypeError);
    assert.equal(Err('boom').unwrapErr(), 'boom');
  });

  it('match', () => {
    assert.equal(Ok(42).match({ Ok: v => v * 2, Err: () => -1 }), 84);
    assert.equal(Err('x').match({ Ok: () => 0, Err: e => e }), 'x');
  });

  it('zip', () => {
    const [a, b] = Ok(1).zip(Ok(2)).unwrap();
    assert.equal(a, 1);
    assert.equal(b, 2);
    assert.equal(Ok(1).zip(Err('x')).isErr, true);
    assert.equal(Err('y').zip(Ok(1)).isErr, true);
  });

  it('ap - applicative apply', () => {
    const double = (n) => n * 2;
    assert.equal(Ok(21).ap(Ok(double)).unwrap(), 42);
    assert.equal(Ok(21).ap(Err('no fn')).isErr, true);
    assert.equal(Err('no val').ap(Ok(double)).isErr, true);
    assert.equal(Err('no val').ap(Err('no fn')).isErr, true);
  });

  it('toOption', () => {
    assert.equal(Ok(42).toOption().unwrap(), 42);
    assert.equal(Err('x').toOption().isNone, true);
  });

  it('Result.collect', () => {
    assert.deepEqual(Result.collect([Ok(1), Ok(2), Ok(3)]).unwrap(), [1, 2, 3]);
    assert.equal(Result.collect([Ok(1), Err('x'), Ok(3)]).isErr, true);
  });

  it('Result.collect with empty array', () => {
    const result = Result.collect([]);
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it('Result.tryCatch', () => {
    assert.equal(Result.tryCatch(() => 42).unwrap(), 42);
    assert.equal(Result.tryCatch(() => { throw new Error('boom'); }, e => e.message).unwrapErr(), 'boom');
  });

  it('Result.Ok / Result.Err aliases', () => {
    assert.equal(Result.Ok(42).unwrap(), 42);
    assert.equal(Result.Err('fail').unwrapErr(), 'fail');
  });

  it('Result.match standalone', () => {
    assert.equal(Result.match(Ok(42), { Ok: v => v * 2, Err: () => -1 }), 84);
    assert.equal(Result.match(Err('x'), { Ok: () => 0, Err: e => e }), 'x');
  });

  it('Result.is type guard', () => {
    assert.equal(Result.is(Ok(1)), true);
    assert.equal(Result.is(Err('x')), true);
    assert.equal(Result.is(Some(1)), false);
    assert.equal(Result.is(42), false);
    assert.equal(Result.is(null), false);
  });

  it('toString/toJSON', () => {
    assert.equal(Ok(42).toString(), 'Ok(42)');
    assert.equal(Err('x').toString(), 'Err(x)');
    assert.deepEqual(Ok(42).toJSON(), { tag: 'Ok', value: 42 });
    assert.deepEqual(Err('x').toJSON(), { tag: 'Err', error: 'x' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Option
// ═══════════════════════════════════════════════════════════════════════════════

describe('Option', () => {
  it('Some/None construction', () => {
    assert.equal(Some(42).tag, 'Some');
    assert.equal(Some(42).value, 42);
    assert.equal(Some(42).isSome, true);
    assert.equal(None.tag, 'None');
    assert.equal(None.isNone, true);
  });

  it('map/flatMap/filter', () => {
    assert.equal(Some(2).map(n => n * 3).unwrap(), 6);
    assert.equal(None.map(() => 99).isNone, true);
    assert.equal(Some(2).flatMap(n => Some(n * 3)).unwrap(), 6);
    assert.equal(Some(2).filter(n => n > 5).isNone, true);
    assert.equal(Some(10).filter(n => n > 5).unwrap(), 10);
  });

  it('tap', () => {
    let tapped = 0;
    Some(42).tap(v => { tapped = v; });
    assert.equal(tapped, 42);

    // tap on None is no-op
    let didTap = false;
    None.tap(() => { didTap = true; });
    assert.equal(didTap, false);
  });

  it('unwrap/unwrapOr/unwrapOrElse', () => {
    assert.equal(Some(42).unwrap(), 42);
    assert.throws(() => None.unwrap(), TypeError);
    assert.equal(None.unwrapOr(0), 0);
    assert.equal(None.unwrapOrElse(() => 99), 99);
  });

  it('match', () => {
    assert.equal(Some(42).match({ Some: v => v, None: () => -1 }), 42);
    assert.equal(None.match({ Some: () => 0, None: () => -1 }), -1);
  });

  it('zip/or', () => {
    const [a, b] = Some(1).zip(Some(2)).unwrap();
    assert.equal(a, 1);
    assert.equal(b, 2);
    assert.equal(Some(1).zip(None).isNone, true);
    assert.equal(None.or(Some(42)).unwrap(), 42);
    assert.equal(Some(1).or(Some(99)).unwrap(), 1);
  });

  it('ap - applicative apply', () => {
    const double = (n) => n * 2;
    assert.equal(Some(21).ap(Some(double)).unwrap(), 42);
    assert.equal(Some(21).ap(None).isNone, true);
    assert.equal(None.ap(Some(double)).isNone, true);
    assert.equal(None.ap(None).isNone, true);
  });

  it('toResult', () => {
    assert.equal(Some(42).toResult('missing').unwrap(), 42);
    assert.equal(None.toResult('missing').unwrapErr(), 'missing');
  });

  it('Option.fromNullable', () => {
    assert.equal(Option.fromNullable('hello').unwrap(), 'hello');
    assert.equal(Option.fromNullable(null).isNone, true);
    assert.equal(Option.fromNullable(undefined).isNone, true);
    assert.equal(Option.fromNullable(0).unwrap(), 0);
    assert.equal(Option.fromNullable('').unwrap(), '');
  });

  it('Option.collect', () => {
    assert.deepEqual(Option.collect([Some(1), Some(2)]).unwrap(), [1, 2]);
    assert.equal(Option.collect([Some(1), None]).isNone, true);
  });

  it('Option.collect with empty array', () => {
    const result = Option.collect([]);
    assert.equal(result.isSome, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it('Option.Some / Option.None aliases', () => {
    assert.equal(Option.Some(42).unwrap(), 42);
    assert.equal(Option.None.isNone, true);
  });

  it('Option.match standalone', () => {
    assert.equal(Option.match(Some(42), { Some: v => v * 2, None: () => -1 }), 84);
    assert.equal(Option.match(None, { Some: () => 0, None: () => -1 }), -1);
  });

  it('Option.is type guard', () => {
    assert.equal(Option.is(Some(1)), true);
    assert.equal(Option.is(None), true);
    assert.equal(Option.is(Ok(1)), false);
    assert.equal(Option.is(42), false);
    assert.equal(Option.is(null), false);
  });

  it('toString/toJSON', () => {
    assert.equal(Some(42).toString(), 'Some(42)');
    assert.equal(None.toString(), 'None');
    assert.deepEqual(Some(42).toJSON(), { tag: 'Some', value: 42 });
    assert.deepEqual(None.toJSON(), { tag: 'None' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// pipe / flow
// ═══════════════════════════════════════════════════════════════════════════════

describe('pipe', () => {
  it('passes value through stages', () => {
    assert.equal(pipe(10, n => n + 1, n => n * 2), 22);
    assert.equal(pipe('hello', s => s.toUpperCase()), 'HELLO');
  });

  it('single arg returns value', () => {
    assert.equal(pipe(42), 42);
  });

  it('9-stage pipeline (max overload)', () => {
    const result = pipe(
      1,
      n => n + 1,   // 2
      n => n * 2,   // 4
      n => n + 1,   // 5
      n => n * 2,   // 10
      n => n + 1,   // 11
      n => n * 2,   // 22
      n => n + 1,   // 23
      n => n * 2,   // 46
    );
    assert.equal(result, 46);
  });
});

describe('flow', () => {
  it('composes left-to-right', () => {
    const fn = flow(n => n + 1, n => n * 2);
    assert.equal(fn(10), 22);
  });

  it('single fn passes through', () => {
    const fn = flow(n => n * 3);
    assert.equal(fn(10), 30);
  });

  it('6-stage composition (max overload)', () => {
    const fn = flow(
      n => n + 1,
      n => n * 2,
      n => n + 1,
      n => n * 2,
      n => n + 1,
      n => n * 2,
    );
    assert.equal(fn(1), 22);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Lazy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lazy', () => {
  it('evaluates once on first access', () => {
    let count = 0;
    const lazy = new Lazy(() => { count++; return 42; });
    assert.equal(lazy.isEvaluated, false);
    assert.equal(lazy.value, 42);
    assert.equal(lazy.isEvaluated, true);
    assert.equal(lazy.value, 42);
    assert.equal(count, 1);
  });

  it('map returns new deferred Lazy', () => {
    const lazy = new Lazy(() => 21);
    const doubled = lazy.map(n => n * 2);
    assert.equal(doubled.isEvaluated, false);
    assert.equal(doubled.value, 42);
  });

  it('flatMap chains', () => {
    const lazy = new Lazy(() => 21).flatMap(n => new Lazy(() => n * 2));
    assert.equal(lazy.value, 42);
  });

  it('toOption/toResult handle exceptions', () => {
    const good = new Lazy(() => 42);
    assert.equal(good.toOption().unwrap(), 42);

    const bad = new Lazy(() => { throw new Error('boom'); });
    assert.equal(bad.toOption().isNone, true);
    assert.equal(bad.toResult(e => e.message).unwrapErr(), 'boom');
  });

  it('unwrapOr handles exceptions', () => {
    const bad = new Lazy(() => { throw new Error(); });
    assert.equal(bad.unwrapOr(99), 99);
  });

  it('toString() shows evaluation state', () => {
    const lazy = new Lazy(() => 42);
    assert.equal(lazy.toString(), 'Lazy(<pending>)');
    lazy.value; // force evaluation
    assert.equal(lazy.toString(), 'Lazy(42)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task', () => {
  it('run() executes and returns Result', async () => {
    const task = new Task(async () => Ok(42));
    const result = await task.run();
    assert.equal(result.unwrap(), 42);
  });

  it('map transforms success', async () => {
    const result = await new Task(async () => Ok(21)).map(n => n * 2).run();
    assert.equal(result.unwrap(), 42);
  });

  it('mapErr transforms error', async () => {
    const result = await new Task(async () => Err('x')).mapErr(e => e.toUpperCase()).run();
    assert.equal(result.unwrapErr(), 'X');
  });

  it('flatMap chains', async () => {
    const result = await new Task(async () => Ok(21))
      .flatMap(n => new Task(async () => Ok(n * 2)))
      .run();
    assert.equal(result.unwrap(), 42);
  });

  it('flatMap short-circuits on error', async () => {
    let ran = false;
    const result = await new Task(async () => Err('stop'))
      .flatMap(() => new Task(async () => { ran = true; return Ok(99); }))
      .run();
    assert.equal(result.isErr, true);
    assert.equal(ran, false);
  });

  it('tap runs side-effect on success', async () => {
    let tapped = 0;
    await new Task(async () => Ok(42)).tap(v => { tapped = v; }).run();
    assert.equal(tapped, 42);
  });

  it('tap does not run on error', async () => {
    let didTap = false;
    await new Task(async () => Err('x')).tap(() => { didTap = true; }).run();
    assert.equal(didTap, false);
  });

  it('tapErr runs side-effect on error', async () => {
    let tapped = '';
    await new Task(async () => Err('fail')).tapErr(e => { tapped = e; }).run();
    assert.equal(tapped, 'fail');
  });

  it('tapErr does not run on success', async () => {
    let didTap = false;
    await new Task(async () => Ok(42)).tapErr(() => { didTap = true; }).run();
    assert.equal(didTap, false);
  });

  it('unwrapOr provides fallback', async () => {
    const okResult = await new Task(async () => Ok(42)).unwrapOr(0).run();
    assert.equal(okResult.unwrap(), 42);

    const errResult = await new Task(async () => Err('x')).unwrapOr(99).run();
    assert.equal(errResult.unwrap(), 99);
  });

  it('runGetOr extracts value or uses fallback', async () => {
    assert.equal(await new Task(async () => Ok(42)).runGetOr(0), 42);
    assert.equal(await new Task(async () => Err('x')).runGetOr(99), 99);
  });

  it('Task.of wraps value', async () => {
    assert.equal((await Task.of(42).run()).unwrap(), 42);
  });

  it('Task.fromResult wraps Result', async () => {
    assert.equal((await Task.fromResult(Ok(42)).run()).unwrap(), 42);
    assert.equal((await Task.fromResult(Err('x')).run()).isErr, true);
  });

  it('Task.fromPromise catches rejections', async () => {
    const result = await Task.fromPromise(
      () => Promise.reject(new Error('boom')),
      e => e.message,
    ).run();
    assert.equal(result.unwrapErr(), 'boom');
  });

  it('Task.all parallel execution', async () => {
    const result = await Task.all([Task.of(1), Task.of(2), Task.of(3)]).run();
    assert.deepEqual(result.unwrap(), [1, 2, 3]);
  });

  it('Task.all short-circuits', async () => {
    const result = await Task.all([Task.of(1), Task.fromResult(Err('x'))]).run();
    assert.equal(result.isErr, true);
  });

  it('Task.all with empty array', async () => {
    const result = await Task.all([]).run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it('zip runs parallel', async () => {
    const result = await Task.of(1).zip(Task.of(2)).run();
    const [a, b] = result.unwrap();
    assert.equal(a, 1);
    assert.equal(b, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════════

describe('Schema', () => {
  it('string/number/boolean', () => {
    assert.equal(Schema.string.parse('hello').isOk, true);
    assert.equal(Schema.string.parse(42).isErr, true);
    assert.equal(Schema.number.parse(42).isOk, true);
    assert.equal(Schema.number.parse(NaN).isErr, true);
    assert.equal(Schema.boolean.parse(true).isOk, true);
  });

  it('object validates shape', () => {
    const S = Schema.object({ name: Schema.string, age: Schema.number });
    const result = S.parse({ name: 'John Doe', age: 21 });
    assert.equal(result.isOk, true);
    assert.equal(result.unwrap().name, 'John Doe');
  });

  it('object returns ImmutableRecord', () => {
    const S = Schema.object({ name: Schema.string });
    const result = S.parse({ name: 'John Doe' });
    assert.equal(result.unwrap().$immutable, true);
    assert.equal(typeof result.unwrap().set, 'function');
  });

  it('object error path', () => {
    const S = Schema.object({ user: Schema.object({ name: Schema.string }) });
    const result = S.parse({ user: { name: 42 } });
    assert.equal(result.isErr, true);
    assert.deepEqual(result.unwrapErr().path, ['user', 'name']);
  });

  it('object with empty shape', () => {
    const S = Schema.object({});
    const result = S.parse({});
    assert.equal(result.isOk, true);
  });

  it('object rejects non-objects', () => {
    const S = Schema.object({ name: Schema.string });
    assert.equal(S.parse(null).isErr, true);
    assert.equal(S.parse([]).isErr, true);
    assert.equal(S.parse('string').isErr, true);
  });

  it('array', () => {
    const S = Schema.array(Schema.number);
    const result = S.parse([1, 2, 3]);
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap().$raw, [1, 2, 3]);
    assert.equal(S.parse([1, 'x']).isErr, true);
  });

  it('literal/union', () => {
    const S = Schema.union(Schema.literal('a'), Schema.literal('b'));
    assert.equal(S.parse('a').isOk, true);
    assert.equal(S.parse('c').isErr, true);
  });

  it('refine', () => {
    const Port = Schema.number.refine(n => n >= 1 && n <= 65535, 'port');
    assert.equal(Port.parse(8080).isOk, true);
    assert.equal(Port.parse(99999).isErr, true);
  });

  it('transform', () => {
    const Upper = Schema.string.transform(s => s.toUpperCase());
    assert.equal(Upper.parse('hello').unwrap(), 'HELLO');
  });

  it('optional', () => {
    const S = Schema.string.optional();
    assert.equal(S.parse(undefined).isOk, true);
    assert.equal(S.parse('hello').isOk, true);
  });

  it('default', () => {
    const S = Schema.number.default(42);
    assert.equal(S.parse(undefined).unwrap(), 42);
    assert.equal(S.parse(null).unwrap(), 42);
    assert.equal(S.parse(10).unwrap(), 10);
  });

  it('is() type guard', () => {
    assert.equal(Schema.string.is('hello'), true);
    assert.equal(Schema.string.is(42), false);
  });

  it('record (string-keyed map)', () => {
    const S = Schema.record(Schema.number);
    const result = S.parse({ a: 1, b: 2 });
    assert.equal(result.isOk, true);
  });

  it('tuple', () => {
    const S = Schema.tuple(Schema.string, Schema.number);
    const result = S.parse(['hello', 42]);
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap().$raw, ['hello', 42]);
    assert.equal(S.parse(['hello']).isErr, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// deepEqual - edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('deepEqual edge cases', () => {
  it('detects different keys with same count', () => {
    const a = Record({ x: 1, y: 2 });
    const b = Record({ x: 1, z: 2 });
    assert.equal(a.equals(b), false);
  });

  it('handles nested arrays in equality', () => {
    const a = Record({ data: [1, [2, 3]] });
    const b = Record({ data: [1, [2, 3]] });
    const c = Record({ data: [1, [2, 4]] });
    assert.equal(a.equals(b), true);
    assert.equal(a.equals(c), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TaggedError
// ═══════════════════════════════════════════════════════════════════════════════

describe('TaggedError', () => {
  const NotFound = TaggedError('NotFound', 'NOT_FOUND');
  const Forbidden = TaggedError('Forbidden', 'FORBIDDEN');

  it('constructor produces frozen error with correct fields', () => {
    const err = NotFound('User not found', { userId: 'u_123' });
    assert.equal(err.tag, 'NotFound');
    assert.equal(err.name, 'NotFound');
    assert.equal(err.code, 'NOT_FOUND');
    assert.equal(err.message, 'User not found');
    assert.deepEqual(err.metadata, { userId: 'u_123' });
    assert.equal(typeof err.timestamp, 'number');
    assert.equal(Object.isFrozen(err), true);
  });

  it('tag/name/code match defined values', () => {
    const err = Forbidden('Access denied');
    assert.equal(err.tag, 'Forbidden');
    assert.equal(err.name, 'Forbidden');
    assert.equal(err.code, 'FORBIDDEN');
  });

  it('metadata defaults to empty object when omitted', () => {
    const err = NotFound('gone');
    assert.deepEqual(err.metadata, {});
    assert.equal(Object.isFrozen(err.metadata), true);
  });

  it('metadata is deep frozen', () => {
    const err = NotFound('gone', { nested: { value: 1 } });
    assert.throws(() => { err.metadata.nested.value = 2; }, TypeError);
  });

  it('timestamp is a recent epoch ms number', () => {
    const before = Date.now();
    const err = NotFound('gone');
    const after = Date.now();
    assert.equal(err.timestamp >= before, true);
    assert.equal(err.timestamp <= after, true);
  });

  it('stack is always captured as a string', () => {
    const err = NotFound('gone');
    assert.equal(typeof err.stack, 'string');
  });

  it('toJSON() excludes stack, includes all other fields', () => {
    const err = NotFound('User not found', { userId: 'u_123' });
    const json = err.toJSON();
    assert.equal(json.tag, 'NotFound');
    assert.equal(json.name, 'NotFound');
    assert.equal(json.code, 'NOT_FOUND');
    assert.equal(json.message, 'User not found');
    assert.deepEqual(json.metadata, { userId: 'u_123' });
    assert.equal(typeof json.timestamp, 'number');
    assert.equal('stack' in json, false);
  });

  it('toString() formats as Tag(CODE): message', () => {
    const err = NotFound('User not found');
    assert.equal(err.toString(), 'NotFound(NOT_FOUND): User not found');
  });

  it('toResult() wraps in Err', () => {
    const err = NotFound('gone');
    const result = err.toResult();
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr(), err);
  });

  it('isTaggedError() returns true for instances', () => {
    const err = NotFound('gone');
    assert.equal(isTaggedError(err), true);
  });

  it('isTaggedError() returns false for plain objects/null/primitives', () => {
    assert.equal(isTaggedError(null), false);
    assert.equal(isTaggedError(undefined), false);
    assert.equal(isTaggedError(42), false);
    assert.equal(isTaggedError('string'), false);
    assert.equal(isTaggedError({ tag: 'X' }), false);
    assert.equal(isTaggedError({ tag: 'X', code: 'Y', message: 'z' }), false);
  });

  it('Constructor.is() matches specific error type', () => {
    const err = NotFound('gone');
    assert.equal(NotFound.is(err), true);
    assert.equal(Forbidden.is(err), false);
  });

  it('Constructor.is() rejects non-TaggedError values', () => {
    assert.equal(NotFound.is(null), false);
    assert.equal(NotFound.is({ tag: 'NotFound', code: 'NOT_FOUND' }), false);
  });

  it('Constructor.tag and .code are readable', () => {
    assert.equal(NotFound.tag, 'NotFound');
    assert.equal(NotFound.code, 'NOT_FOUND');
    assert.equal(Forbidden.tag, 'Forbidden');
    assert.equal(Forbidden.code, 'FORBIDDEN');
  });

  it('error instance is frozen (property assignment throws)', () => {
    const err = NotFound('gone');
    assert.throws(() => { err.tag = 'Other'; }, TypeError);
    assert.throws(() => { err.message = 'changed'; }, TypeError);
  });

  it('composes with Result.match()', () => {
    const err = NotFound('gone');
    const result = err.toResult();
    const output = result.match({
      Ok: () => 'ok',
      Err: e => `${e.tag}: ${e.message}`,
    });
    assert.equal(output, 'NotFound: gone');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Standalone aliases: match, tryCatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('match (standalone)', () => {
  it('matches Result', () => {
    assert.equal(match(Ok(42), { Ok: v => v * 2, Err: () => -1 }), 84);
    assert.equal(match(Err('x'), { Ok: () => 0, Err: e => e }), 'x');
  });

  it('matches Option', () => {
    assert.equal(match(Some(42), { Some: v => v * 2, None: () => -1 }), 84);
    assert.equal(match(None, { Some: () => 0, None: () => -1 }), -1);
  });
});

describe('tryCatch (standalone)', () => {
  it('catches and wraps', () => {
    assert.equal(tryCatch(() => 42).unwrap(), 42);
    assert.equal(tryCatch(() => { throw new Error('boom'); }, e => e.message).unwrapErr(), 'boom');
  });
});
