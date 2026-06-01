const mongoose = require("mongoose");

/**
 * @typedef {Object} Goal
 * @property {mongoose.Types.ObjectId} userId - Reference to User
 * @property {string} name - Goal name (e.g. "Buy a car", "Europe trip")
 * @property {number} targetAmount - Total amount needed in INR
 * @property {number} currentAmount - Amount saved/invested toward this goal so far
 * @property {Date} deadline - Target date to reach the goal
 * @property {'mutual_fund'|'sip'|'stocks'|'etf'|'fd'|'savings'|'mixed'} linkedInvestmentType
 * @property {number} monthlyRequired - Calculated: how much to save/invest per month
 * @property {'active'|'completed'|'paused'} status - Current goal state
 * @property {string} [note] - Optional description or motivation note
 */
const GoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Goal name is required"],
      trim: true,
      maxlength: [100, "Goal name cannot exceed 100 characters"],
    },
    targetAmount: {
      type: Number,
      required: [true, "Target amount is required"],
      min: [1, "Target amount must be greater than 0"],
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, "Current amount cannot be negative"],
    },
    deadline: {
      type: Date,
      required: [true, "Deadline is required"],
      validate: {
        validator: function (date) {
          return date > new Date();
        },
        message: "Deadline must be in the future",
      },
    },
    linkedInvestmentType: {
      type: String,
      enum: ["mutual_fund", "sip", "stocks", "etf", "fd", "savings", "mixed"],
      default: "savings",
    },
    /**
     * Calculated field — set by the Goals service, not by user input directly.
     * Formula: (targetAmount - currentAmount) / monthsUntilDeadline
     */
    monthlyRequired: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "completed", "paused"],
      default: "active",
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [300, "Note cannot exceed 300 characters"],
    },
  },
  { timestamps: true }
);

// Compound index: user's active goals sorted by deadline
GoalSchema.index({ userId: 1, status: 1, deadline: 1 });

/** Virtual: how much is still needed */
GoalSchema.virtual("amountRemaining").get(function () {
  return Math.max(0, this.targetAmount - this.currentAmount);
});

/** Virtual: progress percentage (0–100) */
GoalSchema.virtual("progressPercent").get(function () {
  if (this.targetAmount === 0) return 0;
  return Math.min(100, Math.round((this.currentAmount / this.targetAmount) * 100));
});

/** Virtual: months remaining until deadline */
GoalSchema.virtual("monthsRemaining").get(function () {
  const now = new Date();
  const diff =
    (this.deadline.getFullYear() - now.getFullYear()) * 12 +
    (this.deadline.getMonth() - now.getMonth());
  return Math.max(0, diff);
});

module.exports = mongoose.model("Goal", GoalSchema);
