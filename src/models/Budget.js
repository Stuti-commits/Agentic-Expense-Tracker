const mongoose = require("mongoose");

/**
 * @typedef {Object} CategoryAllocation
 * @property {string} subcategory - e.g. "groceries", "rent", "dining"
 * @property {'primary'|'secondary'|'investment'} group - Which budget group it belongs to
 * @property {number} allocated - Amount allocated for the month
 * @property {number} spent - Amount spent so far (updated on each transaction)
 * @property {number} remaining - allocated - spent (virtual or updated field)
 */
const CategoryAllocationSchema = new mongoose.Schema(
  {
    subcategory: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    group: {
      type: String,
      enum: ["primary", "secondary", "investment"],
      required: true,
    },
    allocated: {
      type: Number,
      required: true,
      min: [0, "Allocated amount cannot be negative"],
    },
    spent: {
      type: Number,
      default: 0,
      min: [0, "Spent amount cannot be negative"],
    },
  },
  { _id: false }
);

/** Virtual: remaining = allocated - spent */
CategoryAllocationSchema.virtual("remaining").get(function () {
  return this.allocated - this.spent;
});

/** Virtual: percentUsed as a 0–100 number */
CategoryAllocationSchema.virtual("percentUsed").get(function () {
  if (this.allocated === 0) return 0;
  return Math.round((this.spent / this.allocated) * 100);
});

/**
 * @typedef {Object} Budget
 * @property {mongoose.Types.ObjectId} userId - Reference to User
 * @property {number} month - Month number (1–12)
 * @property {number} year - Full year (e.g. 2025)
 * @property {number} totalIncome - Total income for this month (snapshot at budget creation)
 * @property {number} primaryAllocated - Total INR allocated to primary group
 * @property {number} secondaryAllocated - Total INR allocated to secondary group
 * @property {number} investmentAllocated - Total INR allocated to investment group
 * @property {CategoryAllocation[]} categories - Per-subcategory breakdown
 */
const BudgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2020,
    },
    totalIncome: {
      type: Number,
      required: true,
      min: [0, "Income cannot be negative"],
    },
    // Group-level totals — calculated from budgetRule % × totalIncome
    primaryAllocated: { type: Number, default: 0 },
    secondaryAllocated: { type: Number, default: 0 },
    investmentAllocated: { type: Number, default: 0 },

    // Group-level spent totals — updated on each transaction
    primarySpent: { type: Number, default: 0 },
    secondarySpent: { type: Number, default: 0 },
    investmentSpent: { type: Number, default: 0 },

    categories: {
      type: [CategoryAllocationSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// One budget doc per user per month — enforced by unique index
BudgetSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

/** Virtual: group-level remaining amounts */
BudgetSchema.virtual("primaryRemaining").get(function () {
  return this.primaryAllocated - this.primarySpent;
});
BudgetSchema.virtual("secondaryRemaining").get(function () {
  return this.secondaryAllocated - this.secondarySpent;
});
BudgetSchema.virtual("investmentRemaining").get(function () {
  return this.investmentAllocated - this.investmentSpent;
});

module.exports = mongoose.model("Budget", BudgetSchema);
