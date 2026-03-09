const bcrypt = require("bcryptjs");
const db = require("../config/db");

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function saveAdminSession(req, res, admin, message, statusCode = 200) {
  req.session.admin = {
    id: admin.id,
    email: admin.email
  };

  // Only store the minimal admin data needed for route protection.
  return req.session.save((error) => {
    if (error) {
      console.error("Session save error:", error);
      return res.status(500).json({ message: "Authentication failed. Please try again." });
    }

    return res.status(statusCode).json({
      message,
      admin: req.session.admin
    });
  });
}

async function registerAdmin(req, res) {
  const { email, password, confirmPassword } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters long." });
  }

  if (
    typeof confirmPassword !== "undefined" &&
    String(password) !== String(confirmPassword)
  ) {
    return res.status(400).json({ message: "Password and confirm password must match." });
  }

  try {
    const existingAdmin = await db.findAdminByEmail(normalizedEmail);

    if (existingAdmin) {
      return res
        .status(409)
        .json({ message: "An admin account with this email already exists." });
    }

    const hashedPassword = bcrypt.hashSync(String(password), 10);
    const createdAdmin = await db.createAdmin(normalizedEmail, hashedPassword);

    return saveAdminSession(
      req,
      res,
      createdAdmin,
      "Sign up successful. Redirecting...",
      201
    );
  } catch (error) {
    if (error.code === "23505" || error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res
        .status(409)
        .json({ message: "An admin account with this email already exists." });
    }

    console.error("Register admin error:", error);
    return res.status(500).json({ message: "Unable to create admin account." });
  }
}

async function loginAdmin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    const admin = await db.findAdminByEmail(normalizedEmail);

    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const passwordMatches = bcrypt.compareSync(String(password), admin.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return saveAdminSession(req, res, admin, "Login successful.");
  } catch (error) {
    console.error("Login admin error:", error);
    return res.status(500).json({ message: "Unable to sign in right now." });
  }
}

function logoutAdmin(req, res) {
  if (!req.session) {
    return res.json({ message: "Logout successful." });
  }

  return req.session.destroy((error) => {
    if (error) {
      console.error("Session destroy error:", error);
      return res.status(500).json({ message: "Logout failed. Please try again." });
    }

    res.clearCookie("ems.sid");
    return res.json({ message: "Logout successful." });
  });
}

function getCurrentAdmin(req, res) {
  if (!req.session || !req.session.admin) {
    return res.status(200).json({
      authenticated: false,
      admin: null
    });
  }

  return res.json({
    authenticated: true,
    admin: req.session.admin
  });
}

module.exports = {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getCurrentAdmin
};
