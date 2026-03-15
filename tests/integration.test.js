/**
 * integration.test.js - Cross-module integration & full program simulation.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output, not the source.
 *
 * Proves that modules compose correctly at their boundaries:
 * Schema→Record, Result↔Option, ErrType→Task, pipe/flow with monads, etc.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  Record,
  List,
  Schema,
  Ok,
  Err,
  Some,
  None,
  Result,
  Option,
  match,
  tryCatch,
  pipe,
  flow,
  Lazy,
  Task,
  isImmutable,
  ErrType,
  Program,
} = await import("../dist/index.js");

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1: Cross-Module Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Schema -> Record -> List pipeline", () => {
  const ProductSchema = Schema.object({
    id: Schema.number,
    name: Schema.string,
    price: Schema.number.refine(n => n > 0, "positive price"),
  });

  const rawProducts = [
    { id: 1, name: "Widget", price: 9.99 },
    { id: 2, name: "Gadget", price: 24.95 },
    { id: 3, name: "Gizmo", price: 14.5 },
  ];

  it("parses raw objects into plain validated data and collects with Result.collect", () => {
    const results = rawProducts.map(p => ProductSchema.parse(p));
    const collected = Result.collect(results);
    assert.equal(collected.isOk, true);

    const products = collected.unwrap();
    assert.equal(products.length, 3);
    assert.equal(products[0].name, "Widget");
    assert.equal(products[1].name, "Gadget");
  });

  it("converts parsed Records to List and queries with Option-returning methods", () => {
    const parsed = rawProducts.map(p => ProductSchema.parse(p).unwrap());
    const list = List(parsed);

    assert.equal(list.length, 3);
    assert.equal(list.first().unwrap().name, "Widget");
    assert.equal(list.last().unwrap().name, "Gizmo");
    assert.equal(list.at(1).unwrap().name, "Gadget");

    const found = list.find(p => p.name === "Gadget");
    assert.equal(found.isSome, true);
    assert.equal(found.unwrap().price, 24.95);

    const missing = list.find(p => p.name === "Nope");
    assert.equal(missing.isNone, true);
  });

  it("schema failure stays in Result and never reaches Record/List", () => {
    const bad = { id: "not-a-number", name: "Bad", price: 10 };
    const result = ProductSchema.parse(bad);
    assert.equal(result.isErr, true);
    assert.deepEqual(result.unwrapErr().path, ["id"]);
    assert.equal(result.unwrapErr().expected, "number");
  });
});

describe("Result <-> Option conversions", () => {
  it("Ok -> toOption -> Some -> toResult -> Ok round-trip", () => {
    const original = Ok(42);
    const opt = original.toOption();
    assert.equal(opt.isSome, true);
    assert.equal(opt.unwrap(), 42);

    const backToResult = opt.toResult("missing");
    assert.equal(backToResult.isOk, true);
    assert.equal(backToResult.unwrap(), 42);
  });

  it("Err -> toOption -> None -> toResult(newError) -> Err round-trip", () => {
    const original = Err("first error");
    const opt = original.toOption();
    assert.equal(opt.isNone, true);

    const backToResult = opt.toResult("replacement error");
    assert.equal(backToResult.isErr, true);
    assert.equal(backToResult.unwrapErr(), "replacement error");
  });

  it("Option.fromNullable chains into toResult for null-safe lookup", () => {
    const lookup = key => {
      const map = { admin: "Alice", user: "Bob" };
      return Option.fromNullable(map[key]);
    };

    const found = lookup("admin").toResult("not found");
    assert.equal(found.isOk, true);
    assert.equal(found.unwrap(), "Alice");

    const missing = lookup("guest").toResult("not found");
    assert.equal(missing.isErr, true);
    assert.equal(missing.unwrapErr(), "not found");
  });
});

describe("ErrType -> Result -> Task error pipeline", () => {
  const ValidationError = ErrType("ValidationError");
  const NetworkError = ErrType("NetworkError");

  it("happy path: both Tasks succeed through flatMap chain", async () => {
    const validate = value => new Task(async () => Ok(value));
    const save = value => new Task(async () => Ok({ saved: true, value }));

    const result = await validate("data")
      .flatMap(v => save(v))
      .run();

    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), { saved: true, value: "data" });
  });

  it("validation failure short-circuits flatMap", async () => {
    let secondRan = false;
    const validate = () =>
      Task.fromResult(ValidationError("bad input", { field: "email" }).toResult());
    const save = () =>
      new Task(async () => {
        secondRan = true;
        return Ok("saved");
      });

    const result = await validate()
      .flatMap(() => save())
      .run();

    assert.equal(result.isErr, true);
    assert.equal(secondRan, false);
    const err = result.unwrapErr();
    assert.equal(err.tag, "ValidationError");
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.deepEqual(err.metadata, { field: "email" });
  });

  it("network failure propagates with full ErrType structure", async () => {
    const fetchData = () =>
      Task.fromResult(NetworkError("connection refused", { host: "api.example.com" }).toResult());

    const result = await fetchData()
      .map(d => d.toUpperCase())
      .run();

    assert.equal(result.isErr, true);
    const err = result.unwrapErr();
    assert.equal(err.tag, "NetworkError");
    assert.equal(err.code, "NETWORK_ERROR");
    assert.equal(err.message, "connection refused");
    assert.deepEqual(err.metadata, { host: "api.example.com" });
    assert.equal(typeof err.timestamp, "number");
  });
});

describe("pipe/flow with monadic types", () => {
  it("pipe threads value through Schema.parse -> Result.map -> toOption -> unwrapOr", () => {
    const EmailSchema = Schema.string.refine(s => s.includes("@"), "email");

    const result = pipe(
      "user@example.com",
      input => EmailSchema.parse(input),
      r => r.map(v => v.toUpperCase()),
      r => r.toOption(),
      opt => opt.unwrapOr("INVALID"),
    );

    assert.equal(result, "USER@EXAMPLE.COM");
  });

  it("schema failure flows through Err -> None -> fallback", () => {
    const EmailSchema = Schema.string.refine(s => s.includes("@"), "email");

    const result = pipe(
      "not-an-email",
      input => EmailSchema.parse(input),
      r => r.map(v => v.toUpperCase()),
      r => r.toOption(),
      opt => opt.unwrapOr("INVALID"),
    );

    assert.equal(result, "INVALID");
  });

  it("flow creates a reusable validation pipeline", () => {
    const normalise = flow(
      s => s.trim(),
      s => s.toLowerCase(),
    );

    assert.equal(normalise("  HELLO@WORLD.COM  "), "hello@world.com");
    assert.equal(normalise("TEST"), "test");
  });
});

describe("Lazy with Schema + Record", () => {
  it("Lazy defers schema parsing, evaluates once, wraps into Record", () => {
    let evalCount = 0;
    const UserSchema = Schema.object({ name: Schema.string, age: Schema.number });

    const lazy = new Lazy(() => {
      evalCount++;
      return Record(UserSchema.parse({ name: "Alice", age: 30 }).unwrap());
    });

    assert.equal(lazy.isEvaluated, false);
    assert.equal(evalCount, 0);

    const record = lazy.value;
    assert.equal(record.$immutable, true);
    assert.equal(record.name, "Alice");
    assert.equal(evalCount, 1);

    // Second access: no re-evaluation
    const again = lazy.value;
    assert.equal(again.name, "Alice");
    assert.equal(evalCount, 1);
  });

  it("Lazy.toResult converts thrown exceptions from failed parsing", () => {
    const lazy = new Lazy(() => {
      const r = Schema.number.parse("not a number");
      return r.unwrap(); // throws on Err
    });

    const result = lazy.toResult(e => e.message);
    assert.equal(result.isErr, true);
  });

  it("Lazy.toOption returns None on error", () => {
    const lazy = new Lazy(() => {
      throw new Error("boom");
    });

    assert.equal(lazy.toOption().isNone, true);
  });
});

describe("List of Results -> Result.collect -> Task", () => {
  it("validates items, collects, and feeds into Task pipeline", async () => {
    const PositiveNum = Schema.number.refine(n => n > 0, "positive");
    const items = [1, 2, 3, 4, 5];

    const results = items.map(n => PositiveNum.parse(n));
    const collected = Result.collect(results);
    assert.equal(collected.isOk, true);

    const task = Task.fromResult(collected).map(nums => nums.reduce((a, b) => a + b, 0));
    const output = await task.run();
    assert.equal(output.unwrap(), 15);
  });

  it("Result.collect short-circuits on first invalid; Task.map never runs", async () => {
    let taskRan = false;
    const PositiveNum = Schema.number.refine(n => n > 0, "positive");
    const items = [1, -2, 3];

    const results = items.map(n => PositiveNum.parse(n));
    const collected = Result.collect(results);
    assert.equal(collected.isErr, true);

    const task = Task.fromResult(collected).map(nums => {
      taskRan = true;
      return nums.reduce((a, b) => a + b, 0);
    });
    const output = await task.run();
    assert.equal(output.isErr, true);
    assert.equal(taskRan, false);
  });
});

describe("Record.produce with nested structures", () => {
  it("batch-mutates via produce, original untouched, converts to List", () => {
    const order = Record({
      id: "order-1",
      items: [
        { sku: "A", qty: 2 },
        { sku: "B", qty: 1 },
      ],
    });

    const updated = order.produce(d => {
      d.items = [...d.items, { sku: "C", qty: 5 }];
    });

    // Original untouched
    assert.equal(order.items.$raw.length, 2);
    // Updated has new item
    assert.equal(updated.items.$raw.length, 3);

    // Convert to List for querying
    const itemList = List([...updated.items.$raw]);
    assert.equal(itemList.length, 3);
    assert.equal(itemList.find(i => i.sku === "C").unwrap().qty, 5);
    assert.equal(itemList.last().unwrap().sku, "C");
  });
});

describe("Nested Schema -> Record methods", () => {
  const AddressSchema = Schema.object({
    city: Schema.string,
    zip: Schema.string,
  });

  const UserSchema = Schema.object({
    name: Schema.string,
    address: AddressSchema,
  });

  it("nested Schema.object returns plain validated data", () => {
    const result = UserSchema.parse({ name: "Bob", address: { city: "Melbourne", zip: "3000" } });
    assert.equal(result.isOk, true);

    const user = result.unwrap();
    assert.equal(user.name, "Bob");
    assert.equal(user.address.city, "Melbourne");
  });

  it("wrapping parsed data in Record enables set/update/at", () => {
    const user = Record(
      UserSchema.parse({
        name: "Bob",
        address: { city: "Melbourne", zip: "3000" },
      }).unwrap(),
    );

    assert.equal(user.$immutable, true);
    assert.equal(user.address.$immutable, true);

    const moved = user.set(u => u.address.city, "Sydney");
    assert.equal(moved.address.city, "Sydney");
    assert.equal(user.address.city, "Melbourne");

    const upperName = user.update(
      u => u.name,
      n => n.toUpperCase(),
    );
    assert.equal(upperName.name, "BOB");

    const cityOpt = user.at(u => u.address.city);
    assert.equal(cityOpt.isSome, true);
    assert.equal(cityOpt.unwrap(), "Melbourne");
  });

  it("nested validation errors include full path", () => {
    const result = UserSchema.parse({ name: "Bob", address: { city: 42, zip: "3000" } });
    assert.equal(result.isErr, true);
    assert.deepEqual(result.unwrapErr().path, ["address", "city"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2: Full Program Simulation - Order Processing Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe("Program: Order Processing Pipeline", () => {
  // ── Error types ──
  const ValidationError = ErrType("ValidationError");
  const PricingError = ErrType("PricingError");
  const InventoryError = ErrType("InventoryError");

  // ── Schemas ──
  const ItemSchema = Schema.object({
    sku: Schema.string,
    name: Schema.string,
    qty: Schema.number.refine(n => Number.isInteger(n) && n > 0, "positive integer"),
    unitPrice: Schema.number.refine(n => n > 0, "positive price"),
  });

  const CustomerSchema = Schema.object({
    email: Schema.string.refine(s => s.includes("@"), "valid email"),
    name: Schema.string,
  });

  const OrderSchema = Schema.object({
    orderId: Schema.string,
    customer: CustomerSchema,
    items: Schema.array(ItemSchema),
    discountCode: Schema.string.optional(),
  });

  // ── Helpers ──
  const lineTotal = item => item.qty * item.unitPrice;

  const lookupDiscount = code => {
    const discounts = { SAVE10: 0.1, SAVE20: 0.2 };
    return Option.fromNullable(discounts[code]);
  };

  const makeTaxCalculator = rate => new Lazy(() => rate);

  // ── Async checks ──
  const checkPricing = items =>
    new Task(async () => {
      for (const item of items) {
        if (item.unitPrice > 1000) {
          return PricingError(`Price too high for ${item.name}`, {
            sku: item.sku,
            unitPrice: item.unitPrice,
          }).toResult();
        }
      }
      return Ok(true);
    });

  const checkInventory = items =>
    new Task(async () => {
      for (const item of items) {
        if (item.qty > 100) {
          return InventoryError(`Insufficient stock for ${item.name}`, {
            sku: item.sku,
            requested: item.qty,
          }).toResult();
        }
      }
      return Ok(true);
    });

  // ── Pipeline builder ──
  const processOrder = rawInput => {
    return Program("order-processor", () => {
      // Step 1: Schema validation
      const parseResult = OrderSchema.parse(rawInput);
      if (parseResult.isErr) {
        const schemaErr = parseResult.unwrapErr();
        return Task.fromResult(
          ValidationError(`Invalid order: ${schemaErr.expected} at ${schemaErr.path.join(".")}`, {
            path: schemaErr.path,
          }).toResult(),
        );
      }

      const order = parseResult.unwrap();
      const items = order.items;

      // Step 2: Validate all items individually with Result.collect
      const itemResults = items.map((raw, i) => {
        const parsed = ItemSchema.parse(raw);
        return parsed.isOk ? Ok(parsed.unwrap()) : parsed.mapErr(e => `item[${i}]: ${e.expected}`);
      });
      const collectedItems = Result.collect(itemResults);
      if (collectedItems.isErr) {
        return Task.fromResult(
          ValidationError(`Item validation failed: ${collectedItems.unwrapErr()}`).toResult(),
        );
      }

      const validItems = collectedItems.unwrap();

      // Step 3: pipe to calculate subtotal from line totals
      const subtotal = pipe(
        validItems,
        items => items.map(item => lineTotal(item)),
        totals => totals.reduce((sum, t) => sum + t, 0),
      );

      // Step 4: Lazy tax calculator
      const taxCalc = makeTaxCalculator(0.1);
      const tax = taxCalc.value * subtotal;

      // Step 5: Option.fromNullable for discount code
      const discountRate = pipe(
        order.discountCode,
        code => Option.fromNullable(code === undefined ? undefined : code),
        opt => opt.flatMap(c => lookupDiscount(c)),
        opt => opt.unwrapOr(0),
      );
      const discount = subtotal * discountRate;

      // Step 6: checkPricing.zip(checkInventory) for parallel async checks
      return checkPricing(items)
        .zip(checkInventory(items))
        .map(() => ({
          orderId: order.orderId,
          subtotal,
          tax: Math.round(tax * 100) / 100,
          discount: Math.round(discount * 100) / 100,
          total: Math.round((subtotal + tax - discount) * 100) / 100,
          itemCount: validItems.length,
        }));
    });
  };

  // ── Valid order fixtures ──
  const validOrderWithDiscount = {
    orderId: "ORD-001",
    customer: { email: "alice@example.com", name: "Alice" },
    items: [
      { sku: "W1", name: "Widget", qty: 2, unitPrice: 9.99 },
      { sku: "G1", name: "Gadget", qty: 1, unitPrice: 24.95 },
    ],
    discountCode: "SAVE10",
  };

  const validOrderNoDiscount = {
    orderId: "ORD-002",
    customer: { email: "bob@example.com", name: "Bob" },
    items: [{ sku: "W1", name: "Widget", qty: 3, unitPrice: 10.0 }],
  };

  // ── Tests ──

  it("happy path with discount: full pipeline Schema->Record->List->pipe->Lazy->Option->Task.zip->Program", async () => {
    const prog = processOrder(validOrderWithDiscount);
    const result = await prog.execute();

    assert.equal(result.isOk, true);
    const summary = result.unwrap();
    assert.equal(summary.orderId, "ORD-001");
    // subtotal: (2 * 9.99) + (1 * 24.95) = 19.98 + 24.95 = 44.93
    assert.equal(summary.subtotal, 44.93);
    // tax: 44.93 * 0.1 = 4.493 -> 4.49
    assert.equal(summary.tax, 4.49);
    // discount: 44.93 * 0.1 = 4.493 -> 4.49
    assert.equal(summary.discount, 4.49);
    // total: 44.93 + 4.49 - 4.49 = 44.93
    assert.equal(summary.total, 44.93);
    assert.equal(summary.itemCount, 2);
  });

  it("happy path no discount: Option.fromNullable(undefined) -> None -> unwrapOr(0)", async () => {
    const prog = processOrder(validOrderNoDiscount);
    const result = await prog.execute();

    assert.equal(result.isOk, true);
    const summary = result.unwrap();
    assert.equal(summary.orderId, "ORD-002");
    assert.equal(summary.subtotal, 30);
    assert.equal(summary.tax, 3);
    assert.equal(summary.discount, 0);
    assert.equal(summary.total, 33);
    assert.equal(summary.itemCount, 1);
  });

  it("invalid discount code: lookupDiscount returns None, pipeline still succeeds", async () => {
    const order = {
      ...validOrderNoDiscount,
      discountCode: "BOGUS",
    };
    const result = await processOrder(order).execute();

    assert.equal(result.isOk, true);
    assert.equal(result.unwrap().discount, 0);
  });

  it("schema validation failure: bad email wrapped in ValidationError", async () => {
    const order = {
      orderId: "ORD-BAD",
      customer: { email: "not-an-email", name: "Bad" },
      items: [{ sku: "X", name: "X", qty: 1, unitPrice: 1 }],
    };
    const result = await processOrder(order).execute();

    assert.equal(result.isErr, true);
    const err = result.unwrapErr();
    assert.equal(err.tag, "ValidationError");
    assert.equal(err.code, "VALIDATION_ERROR");
  });

  it("pricing error: unitPrice > 1000 triggers PricingError in Task.zip", async () => {
    const order = {
      orderId: "ORD-EXPENSIVE",
      customer: { email: "rich@example.com", name: "Rich" },
      items: [{ sku: "D1", name: "Diamond", qty: 1, unitPrice: 5000 }],
    };
    const result = await processOrder(order).execute();

    assert.equal(result.isErr, true);
    const err = result.unwrapErr();
    assert.equal(err.tag, "PricingError");
    assert.equal(err.code, "PRICING_ERROR");
    assert.deepEqual(err.metadata, { sku: "D1", unitPrice: 5000 });
  });

  it("inventory error: qty > 100 triggers InventoryError in Task.zip", async () => {
    const order = {
      orderId: "ORD-BULK",
      customer: { email: "bulk@example.com", name: "Bulk" },
      items: [{ sku: "B1", name: "Bolt", qty: 500, unitPrice: 0.5 }],
    };
    const result = await processOrder(order).execute();

    assert.equal(result.isErr, true);
    const err = result.unwrapErr();
    assert.equal(err.tag, "InventoryError");
    assert.equal(err.code, "INVENTORY_ERROR");
    assert.deepEqual(err.metadata, { sku: "B1", requested: 500 });
  });

  it("match() on final result: exhaustive Ok/Err pattern matching", async () => {
    const okResult = await processOrder(validOrderWithDiscount).execute();
    const okOutput = match(okResult, {
      Ok: summary => `Order ${summary.orderId} total: ${summary.total}`,
      Err: err => `Failed: ${err.message}`,
    });
    assert.equal(okOutput, "Order ORD-001 total: 44.93");

    const errResult = await processOrder({
      orderId: "X",
      customer: { email: "bad", name: "X" },
      items: [{ sku: "X", name: "X", qty: 1, unitPrice: 1 }],
    }).execute();
    const errOutput = match(errResult, {
      Ok: () => "should not reach",
      Err: err => `Failed: ${err.tag}`,
    });
    assert.equal(errOutput, "Failed: ValidationError");
  });

  it("isImmutable verification: Record-wrapped parsed data is immutable", async () => {
    const parsed = OrderSchema.parse(validOrderWithDiscount);
    assert.equal(parsed.isOk, true);

    // Schema returns plain data; wrap in Record for immutability
    const order = Record(parsed.unwrap());
    assert.equal(isImmutable(order), true);
    assert.equal(isImmutable(order.customer), true);
    assert.equal(order.items.$immutable, true);
  });

  it("tryCatch integration: wraps JSON.parse errors into ValidationError", () => {
    const safeParse = input =>
      tryCatch(
        () => JSON.parse(input),
        e => ValidationError(`Invalid JSON: ${e.message}`),
      );

    const good = safeParse('{"ok":true}');
    assert.equal(good.isOk, true);
    assert.deepEqual(good.unwrap(), { ok: true });

    const bad = safeParse("{broken");
    assert.equal(bad.isErr, true);
    assert.equal(bad.unwrapErr().tag, "ValidationError");
    assert.equal(bad.unwrapErr().code, "VALIDATION_ERROR");
  });

  it("flow composes reusable transformers", () => {
    const calculateTotal = flow(
      items => items.map(i => i.qty * i.unitPrice),
      totals => totals.reduce((sum, t) => sum + t, 0),
      subtotal => ({ subtotal, tax: subtotal * 0.1, total: subtotal * 1.1 }),
    );

    const result = calculateTotal([
      { qty: 2, unitPrice: 10 },
      { qty: 1, unitPrice: 5 },
    ]);

    assert.equal(result.subtotal, 25);
    assert.equal(result.tax, 2.5);
    assert.equal(Math.round(result.total * 100) / 100, 27.5);
  });
});
