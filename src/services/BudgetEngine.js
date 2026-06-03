/**
 * BudgetEngine — pure math service.
 *
 * No database calls. No async. Just numbers in, numbers out.
 * This makes it easy to test and easy to reuse anywhere in the app.
 *
 * HOW IT WORKS:
 * 1. You give it the user's income + budget rule
 * 2. It tells you how much is allocated per group
 * 3. You give it the current spent amounts
 * 4. It tells you remaining amounts + any alerts
 */
class BudgetEngine {
  // ─────────────────────────────────────────────
  // STEP 1: Calculate allocations from income
  // ─────────────────────────────────────────────

  /**
   * Calculate how much money is allocated to each group.
   *
   * @param {number} totalIncome - Total monthly income in INR
   * @param {Object} rule - Budget rule object
   * @param {'50/30/20'|'custom'} rule.type
   * @param {number} rule.primary - % for needs (rent, groceries, bills)
   * @param {number} rule.secondary - % for wants (dining, entertainment)
   * @param {number} rule.investment - % for investments (SIP, stocks, MF)
   *
   * @returns {{ primary: number, secondary: number, investment: number }}
   *
   * Example:
   *   income = 100000, rule = { primary: 50, secondary: 30, investment: 20 }
   *   returns { primary: 50000, secondary: 30000, investment: 20000 }
   */
  static calculateAllocations(totalIncome, rule) {
    if (typeof totalIncome !== "number" || totalIncome < 0) {
      throw new Error("totalIncome must be a non-negative number");
    }

    const { primary, secondary, investment } = this._resolveRule(rule);

    // Validate percentages add up to 100
    const total = primary + secondary + investment;
    if (Math.round(total) !== 100) {
      throw new Error(`Budget rule percentages must add up to 100. Got ${total}`);
    }

    return {
      primary: this._round(totalIncome * primary / 100),
      secondary: this._round(totalIncome * secondary / 100),
      investment: this._round(totalIncome * investment / 100),
    };
  }

  // ─────────────────────────────────────────────
  // STEP 2: Check budget status after a transaction
  // ─────────────────────────────────────────────

  /**
   * Given allocations and current spent amounts, calculate remaining
   * and return any alerts.
   *
   * Call this every time a new transaction is added.
   *
   * @param {Object} allocations - Output of calculateAllocations()
   * @param {Object} spent - How much has been spent per group so far
   * @param {number} spent.primary
   * @param {number} spent.secondary
   * @param {number} spent.investment
   *
   * @returns {Object} result
   * @returns {Object} result.remaining - { primary, secondary, investment }
   * @returns {Object} result.percentUsed - { primary, secondary, investment }
   * @returns {Array}  result.alerts - Array of alert objects (may be empty)
   *
   * Alert shapes:
   *   Warning (< 10% left): { type: "warning", category, remaining, percentLeft }
   *   Danger  (overspent):  { type: "danger",  category, overshootAmount }
   */
  static checkBudgetStatus(allocations, spent) {
    this._validateObject(allocations, "allocations");
    this._validateObject(spent, "spent");

    const groups = ["primary", "secondary", "investment"];
    const remaining = {};
    const percentUsed = {};
    const alerts = [];

    groups.forEach((group) => {
      const allocated = allocations[group] ?? 0;
      const spentAmount = spent[group] ?? 0;
      const rem = this._round(allocated - spentAmount);

      remaining[group] = rem;
      percentUsed[group] = allocated > 0
        ? Math.round((spentAmount / allocated) * 100)
        : 0;

      // ── Generate alerts ──────────────────────────
      if (rem < 0) {
        // Overspent — danger
        alerts.push({
          type: "danger",
          category: group,
          overshootAmount: this._round(Math.abs(rem)),
        });
      } else if (allocated > 0 && rem / allocated < 0.10) {
        // Less than 10% remaining — warning
        alerts.push({
          type: "warning",
          category: group,
          remaining: rem,
          percentLeft: Math.round((rem / allocated) * 100),
        });
      }
    });

    return { remaining, percentUsed, alerts };
  }

  // ─────────────────────────────────────────────
  // STEP 3: Process a new transaction
  // ─────────────────────────────────────────────

  /**
   * The main method your route will call on every new transaction.
   *
   * Takes the current budget state + a new transaction,
   * returns updated spent amounts + alerts.
   *
   * @param {Object} allocations - From calculateAllocations()
   * @param {Object} currentSpent - Current spent per group { primary, secondary, investment }
   * @param {Object} transaction - The new transaction
   * @param {number} transaction.amount
   * @param {'debit'|'credit'} transaction.type - Only debits affect budget
   * @param {'primary'|'secondary'|'investment'|'income'|'uncategorized'} transaction.category
   *
   * @returns {Object} result
   * @returns {Object} result.updatedSpent - New spent totals after this transaction
   * @returns {Object} result.budgetStatus - Full status with remaining + alerts
   * @returns {boolean} result.hasAlerts - Quick flag to check if any alerts exist
   */
  static processTransaction(allocations, currentSpent, transaction) {
    const { amount, type, category } = transaction;

    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Transaction amount must be a positive number");
    }

    // Credits (income) and non-budget categories don't affect budget groups
    const budgetGroups = ["primary", "secondary", "investment"];
    const affectsBudget = type === "debit" && budgetGroups.includes(category);

    // Clone spent so we don't mutate the original
    const updatedSpent = { ...currentSpent };

    if (affectsBudget) {
      updatedSpent[category] = this._round((currentSpent[category] ?? 0) + amount);
    }

    const budgetStatus = this.checkBudgetStatus(allocations, updatedSpent);

    return {
      updatedSpent,
      budgetStatus,
      hasAlerts: budgetStatus.alerts.length > 0,
    };
  }

  // ─────────────────────────────────────────────
  // BONUS: Summarise a full month
  // ─────────────────────────────────────────────

  /**
   * Given a list of transactions, calculate total spent per group.
   * Useful when rebuilding budget state from scratch (e.g. after PDF import).
   *
   * @param {Array} transactions - Array of transaction objects
   * @returns {{ primary: number, secondary: number, investment: number }}
   */
  static aggregateSpent(transactions) {
    if (!Array.isArray(transactions)) {
      throw new Error("transactions must be an array");
    }

    const totals = { primary: 0, secondary: 0, investment: 0 };

    transactions.forEach((tx) => {
      if (tx.type === "debit" && totals[tx.category] !== undefined) {
        totals[tx.category] = this._round(totals[tx.category] + tx.amount);
      }
    });

    return totals;
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Resolve a rule into { primary, secondary, investment } percentages.
   * Handles both "50/30/20" shorthand and custom objects.
   */
  static _resolveRule(rule) {
    if (!rule) throw new Error("Budget rule is required");

    if (rule.type === "50/30/20") {
      return { primary: 50, secondary: 30, investment: 20 };
    }

    // Custom rule — must have all three fields
    if (
      typeof rule.primary !== "number" ||
      typeof rule.secondary !== "number" ||
      typeof rule.investment !== "number"
    ) {
      throw new Error("Custom rule must have numeric primary, secondary, and investment fields");
    }

    return { primary: rule.primary, secondary: rule.secondary, investment: rule.investment };
  }

  /** Round to 2 decimal places to avoid floating point weirdness like 0.1 + 0.2 = 0.30000000000000004 */
  static _round(value) {
    return Math.round(value * 100) / 100;
  }

  static _validateObject(obj, name) {
    if (!obj || typeof obj !== "object") {
      throw new Error(`${name} must be an object`);
    }
  }
}

module.exports = BudgetEngine;
