function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  return res.status(401).json({ message: "Unauthorized. Please log in first." });
}

module.exports = {
  requireAuth
};
