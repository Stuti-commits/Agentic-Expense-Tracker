require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// Route imports
const authRoutes = require("./routes/auth.routes");
const transactionRoutes = require("./routes/transaction.routes");
const budgetRoutes = require("./routes/budget.routes");
const goalRoutes = require("./routes/goal.routes");
const familyRoutes = require("./routes/family.routes");

const app = express();

// Connect to MongoDB
connectDB();

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json()); // Parses incoming JSON request bodies

// ── Routes ─────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/family", familyRoutes);

// ── Health check ────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ success: true, data: "Expense Tracker API is running" });
});

// ── Global error handler ────────────────────────────────
// This catches any error thrown from any route
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    data: null,
    error: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
