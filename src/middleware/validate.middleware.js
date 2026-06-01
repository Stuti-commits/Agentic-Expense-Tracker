const { validationResult } = require("express-validator");
const { sendError } = require("../utils/response");

/**
 * Place this AFTER your express-validator checks in any route.
 * If any validation failed, it returns all errors at once.
 * If all good, it calls next() to proceed to the controller.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Collect all error messages into one readable string
    const messages = errors.array().map((e) => e.msg).join(", ");
    return sendError(res, messages, 422);
  }
  next();
};

module.exports = { validate };
