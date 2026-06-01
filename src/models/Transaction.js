const mongoose = require("mongoose");

/**
 * @typedef {Object} Transaction
 * @property {mongoose.Types.ObjectId} userId - Reference to User
 * @property {number} amount - Transaction amount in INR (always positive)
 * @property {'debit'|'credit'} type - Direction of the transaction
 * @property {Date} date - When the transaction occurred
 * @property {string} description - Raw description (from bank or user input)
 * @property {'primary'|'secondary'|'investment'} category - Top-level budget category
 * @property {string} subcategory - Specific category (e.g. "groceries", "dining")
 * @property {'manual'|'pdf_import'|'auto'} source - How this transaction was created
 * @property {boolean} isConfirmed - Whether user has confirmed auto/pdf-imported transactions
 * @property {boolean} familyVisible - Whether linked family members can see this transaction
 * @property {string} [note] - Optional user note
 */
const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    type: {
      type: String,
      enum: ["debit", "credit"],
      required: [true, "Transaction type is required"],
    },
    date: {
      type: Date,
      required: [true, "Transaction date is required"],
      index: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
    },
    category: {
      type: String,
      enum: ["primary", "secondary", "investment", "income", "uncategorized"],
      default: "uncategorized",
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      lowercase: true,
      // Common values: rent, groceries, dairy, gym, bills, emi, insurance,
      // dining, entertainment, shopping, travel, subscriptions,
      // mutual_fund, stocks, sip, etf, fd, salary, freelance
      maxlength: [50, "Subcategory cannot exceed 50 characters"],
    },
    source: {
      type: String,
      enum: ["manual", "pdf_import", "auto"],
      default: "manual",
      index: true,
    },
    isConfirmed: {
      type: Boolean,
      default: false,
      index: true, // Indexed — nightly classifier queries unconfirmed transactions
    },
    familyVisible: {
      type: Boolean,
      default: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
    },
    // Stores the raw parsed row from PDF — useful for debugging misclassifications
    rawImportData: {
      type: mongoose.Schema.Types.Mixed,
      select: false, // Hidden by default, only fetched explicitly
    },
  },
  { timestamps: true }
);

// Compound index: most dashboard queries filter by userId + date range + category
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, category: 1, date: -1 });
TransactionSchema.index({ userId: 1, isConfirmed: 1, source: 1 }); // For nightly classifier job

module.exports = mongoose.model("Transaction", TransactionSchema);
