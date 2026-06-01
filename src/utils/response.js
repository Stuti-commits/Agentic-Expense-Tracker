/**
 * Every API response uses one of these two helpers.
 * This guarantees the shape { success, data, error } everywhere.
 */

const sendSuccess = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    error: null,
  });
};

const sendError = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    error: message,
  });
};

module.exports = { sendSuccess, sendError };
