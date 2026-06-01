const mongoose = require("mongoose");

/**
 * @typedef {Object} IncomeStream
 * @property {string} label - Name of the income source (e.g. "Salary", "Freelance")
 * @property {number} amount - Monthly amount in INR
 * @property {boolean} isActive - Whether this stream is currently active
 */
const IncomeStreamSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, "Income stream label is required"],
      trim: true,
      maxlength: [50, "Label cannot exceed 50 characters"],
    },
    amount: {
      type: Number,
      required: [true, "Income amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

/**
 * @typedef {Object} BudgetRule
 * @property {'50/30/20' | 'custom'} type - Rule type
 * @property {number} primary - % allocated to primary/needs (e.g. 50)
 * @property {number} secondary - % allocated to secondary/wants (e.g. 30)
 * @property {number} investment - % allocated to investments (e.g. 20)
 */
const BudgetRuleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["50/30/20", "custom"],
      default: "50/30/20",
    },
    primary: { type: Number, default: 50, min: 0, max: 100 },
    secondary: { type: Number, default: 30, min: 0, max: 100 },
    investment: { type: Number, default: 20, min: 0, max: 100 },
  },
  { _id: false }
);

/**
 * @typedef {Object} User
 * @property {string} firebaseUid - Firebase Auth UID (primary auth identifier)
 * @property {string} email - User's email address
 * @property {string} name - Display name
 * @property {string} currency - Currency code (default: INR)
 * @property {IncomeStream[]} incomeStreams - Multiple income sources
 * @property {BudgetRule} budgetRule - Budget allocation rule
 * @property {Date} createdAt - Auto-managed by timestamps
 * @property {Date} updatedAt - Auto-managed by timestamps
 */
const UserSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: [true, "Firebase UID is required"],
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      maxlength: 3,
    },
    incomeStreams: {
      type: [IncomeStreamSchema],
      default: [],
      validate: {
        validator: (streams) => streams.length <= 10,
        message: "Cannot have more than 10 income streams",
      },
    },
    budgetRule: {
      type: BudgetRuleSchema,
      default: () => ({}),
      validate: {
        validator: (rule) => rule.primary + rule.secondary + rule.investment === 100,
        message: "Budget rule percentages must add up to 100",
      },
    },
  },
  { timestamps: true }
);

/** Virtual: total monthly income across all active streams */
UserSchema.virtual("totalMonthlyIncome").get(function () {
  return this.incomeStreams
    .filter((s) => s.isActive)
    .reduce((sum, s) => sum + s.amount, 0);
});

module.exports = mongoose.model("User", UserSchema);
