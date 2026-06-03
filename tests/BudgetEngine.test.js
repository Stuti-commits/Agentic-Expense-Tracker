/**
 * Unit tests for BudgetEngine.
 *
 * These tests use Node's built-in `assert` module — no extra packages needed.
 * Run with: node tests/BudgetEngine.test.js
 *
 * A test either passes silently or throws an error with a clear message.
 */

const assert = require("assert");
const BudgetEngine = require("../src/services/BudgetEngine");

// ─── Small test runner ──────────────────────────────────
let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✅ ${description}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${description}`);
    console.log(`     → ${err.message}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════
// GROUP 1: calculateAllocations
// ═══════════════════════════════════════════════════════
console.log("\n📊 calculateAllocations\n");

test("50/30/20 rule splits ₹100,000 correctly", () => {
  const result = BudgetEngine.calculateAllocations(100000, { type: "50/30/20" });
  assert.strictEqual(result.primary, 50000);
  assert.strictEqual(result.secondary, 30000);
  assert.strictEqual(result.investment, 20000);
});

test("custom rule splits correctly", () => {
  const result = BudgetEngine.calculateAllocations(80000, {
    type: "custom",
    primary: 60,
    secondary: 20,
    investment: 20,
  });
  assert.strictEqual(result.primary, 48000);
  assert.strictEqual(result.secondary, 16000);
  assert.strictEqual(result.investment, 16000);
});

test("handles decimal income without floating point errors", () => {
  const result = BudgetEngine.calculateAllocations(33333, { type: "50/30/20" });
  // Should be clean rounded numbers, not 16666.500000000002
  assert.strictEqual(result.primary, 16666.5);
  assert.strictEqual(typeof result.primary, "number");
});

test("throws if income is negative", () => {
  assert.throws(
    () => BudgetEngine.calculateAllocations(-5000, { type: "50/30/20" }),
    /non-negative/
  );
});

test("throws if percentages do not add up to 100", () => {
  assert.throws(
    () => BudgetEngine.calculateAllocations(100000, { type: "custom", primary: 50, secondary: 30, investment: 15 }),
    /add up to 100/
  );
});

test("throws if rule is missing", () => {
  assert.throws(
    () => BudgetEngine.calculateAllocations(100000, null),
    /required/
  );
});

test("throws if custom rule has non-numeric field", () => {
  assert.throws(
    () => BudgetEngine.calculateAllocations(100000, { type: "custom", primary: "50", secondary: 30, investment: 20 }),
    /numeric/
  );
});

test("zero income returns all zeros", () => {
  const result = BudgetEngine.calculateAllocations(0, { type: "50/30/20" });
  assert.strictEqual(result.primary, 0);
  assert.strictEqual(result.secondary, 0);
  assert.strictEqual(result.investment, 0);
});

// ═══════════════════════════════════════════════════════
// GROUP 2: checkBudgetStatus — alerts
// ═══════════════════════════════════════════════════════
console.log("\n🚨 checkBudgetStatus — alerts\n");

test("no alerts when well within budget", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  const spent = { primary: 20000, secondary: 10000, investment: 5000 };
  const { alerts } = BudgetEngine.checkBudgetStatus(allocations, spent);
  assert.strictEqual(alerts.length, 0);
});

test("warning when less than 10% remaining", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  // 49000 spent of 50000 = 2% left → warning
  const spent = { primary: 49000, secondary: 10000, investment: 5000 };
  const { alerts } = BudgetEngine.checkBudgetStatus(allocations, spent);
  const warning = alerts.find((a) => a.category === "primary");
  assert.ok(warning, "Expected a warning for primary");
  assert.strictEqual(warning.type, "warning");
  assert.strictEqual(warning.remaining, 1000);
  assert.strictEqual(warning.percentLeft, 2);
});

test("danger when overspent", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  // 55000 spent of 50000 = overshoot by 5000
  const spent = { primary: 55000, secondary: 10000, investment: 5000 };
  const { alerts } = BudgetEngine.checkBudgetStatus(allocations, spent);
  const danger = alerts.find((a) => a.category === "primary");
  assert.ok(danger, "Expected a danger alert for primary");
  assert.strictEqual(danger.type, "danger");
  assert.strictEqual(danger.overshootAmount, 5000);
});

test("multiple alerts across different groups", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  const spent = { primary: 55000, secondary: 29500, investment: 5000 };
  const { alerts } = BudgetEngine.checkBudgetStatus(allocations, spent);
  // primary: danger (overspent), secondary: warning (<10% left = 500/30000 = 1.6%)
  assert.strictEqual(alerts.length, 2);
  assert.ok(alerts.find((a) => a.type === "danger" && a.category === "primary"));
  assert.ok(alerts.find((a) => a.type === "warning" && a.category === "secondary"));
});

test("exactly 10% remaining triggers NO warning (boundary)", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  // 45000 spent = exactly 10% (5000) left → no alert
  const spent = { primary: 45000, secondary: 10000, investment: 5000 };
  const { alerts } = BudgetEngine.checkBudgetStatus(allocations, spent);
  const primaryAlert = alerts.find((a) => a.category === "primary");
  assert.ok(!primaryAlert, "Should not alert at exactly 10%");
});

test("9.9% remaining triggers warning (boundary)", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  // 45001 spent = 4999/50000 = 9.998% left → warning
  const spent = { primary: 45001, secondary: 10000, investment: 5000 };
  const { alerts } = BudgetEngine.checkBudgetStatus(allocations, spent);
  const warning = alerts.find((a) => a.category === "primary");
  assert.ok(warning, "Should warn at 9.9% remaining");
  assert.strictEqual(warning.type, "warning");
});

test("zero allocation returns 0% used without crashing", () => {
  const allocations = { primary: 0, secondary: 30000, investment: 20000 };
  const spent = { primary: 0, secondary: 10000, investment: 5000 };
  const { percentUsed } = BudgetEngine.checkBudgetStatus(allocations, spent);
  assert.strictEqual(percentUsed.primary, 0); // Should not divide by zero
});

// ═══════════════════════════════════════════════════════
// GROUP 3: processTransaction
// ═══════════════════════════════════════════════════════
console.log("\n💳 processTransaction\n");

test("debit transaction updates the correct group", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  const currentSpent = { primary: 10000, secondary: 5000, investment: 0 };
  const tx = { amount: 2000, type: "debit", category: "primary" };

  const { updatedSpent } = BudgetEngine.processTransaction(allocations, currentSpent, tx);
  assert.strictEqual(updatedSpent.primary, 12000); // 10000 + 2000
  assert.strictEqual(updatedSpent.secondary, 5000); // unchanged
});

test("credit transaction does NOT affect spent totals", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  const currentSpent = { primary: 10000, secondary: 5000, investment: 0 };
  const tx = { amount: 50000, type: "credit", category: "income" };

  const { updatedSpent } = BudgetEngine.processTransaction(allocations, currentSpent, tx);
  assert.deepStrictEqual(updatedSpent, currentSpent); // Nothing changed
});

test("uncategorized transaction does NOT affect budget groups", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  const currentSpent = { primary: 10000, secondary: 5000, investment: 0 };
  const tx = { amount: 500, type: "debit", category: "uncategorized" };

  const { updatedSpent } = BudgetEngine.processTransaction(allocations, currentSpent, tx);
  assert.deepStrictEqual(updatedSpent, currentSpent);
});

test("returns hasAlerts true when transaction triggers overspend", () => {
  const allocations = { primary: 50000, secondary: 30000, investment: 20000 };
  const currentSpent = { primary: 49500, secondary: 5000, investment: 0 };
  const tx = { amount: 1000, type: "debit", category: "primary" }; // pushes over by 500

  const { hasAlerts, budgetStatus } = BudgetEngine.processTransaction(allocations, currentSpent, tx);
  assert.strictEqual(hasAlerts, true);
  assert.strictEqual(budgetStatus.alerts[0].type, "danger");
  assert.strictEqual(budgetStatus.alerts[0].overshootAmount, 500);
});

test("throws if transaction amount is zero", () => {
  assert.throws(
    () => BudgetEngine.processTransaction({}, {}, { amount: 0, type: "debit", category: "primary" }),
    /positive number/
  );
});

test("throws if transaction amount is negative", () => {
  assert.throws(
    () => BudgetEngine.processTransaction({}, {}, { amount: -100, type: "debit", category: "primary" }),
    /positive number/
  );
});

// ═══════════════════════════════════════════════════════
// GROUP 4: aggregateSpent
// ═══════════════════════════════════════════════════════
console.log("\n📦 aggregateSpent\n");

test("correctly totals spending across multiple transactions", () => {
  const transactions = [
    { amount: 15000, type: "debit", category: "primary" },
    { amount: 5000,  type: "debit", category: "primary" },
    { amount: 3000,  type: "debit", category: "secondary" },
    { amount: 50000, type: "credit", category: "income" }, // should be ignored
    { amount: 10000, type: "debit", category: "investment" },
  ];

  const result = BudgetEngine.aggregateSpent(transactions);
  assert.strictEqual(result.primary, 20000);
  assert.strictEqual(result.secondary, 3000);
  assert.strictEqual(result.investment, 10000);
});

test("empty array returns all zeros", () => {
  const result = BudgetEngine.aggregateSpent([]);
  assert.strictEqual(result.primary, 0);
  assert.strictEqual(result.secondary, 0);
  assert.strictEqual(result.investment, 0);
});

test("throws if input is not an array", () => {
  assert.throws(
    () => BudgetEngine.aggregateSpent("not an array"),
    /array/
  );
});

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════
console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("All tests passed ✅\n");
} else {
  console.log("Some tests failed ❌ — check errors above\n");
  process.exit(1);
}
