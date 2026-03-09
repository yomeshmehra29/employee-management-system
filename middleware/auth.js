// Define middleware that only allows requests from authenticated admin sessions.
function requireAuth(req, res, next) {
  // Confirm that a session exists and that the session is marked as admin.
  if (req.session && req.session.admin) {
    // Continue to the next middleware or route handler when access is allowed.
    return next();
  }

  // Reject the request with HTTP 401 when the user is not logged in as an admin.
  return res.status(401).json({ message: "Unauthorized. Please log in first." });
}

// Export the middleware so it can be used to protect routes in other files.
module.exports = {
  // Make the requireAuth function available to other modules.
  requireAuth
};
