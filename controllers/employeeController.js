const db = require("../config/db");

const VALID_STATUSES = ["Active", "Inactive", "On Leave"];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[0-9+\-() ]{7,20}$/.test(phone);
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

function validateEmployeePayload(payload) {
  const errors = {};
  const normalizedEmployee = {
    full_name: String(payload.full_name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    phone: String(payload.phone || "").trim(),
    department: String(payload.department || "").trim(),
    job_role: String(payload.job_role || "").trim(),
    salary: Number(payload.salary),
    joining_date: String(payload.joining_date || "").trim(),
    status: String(payload.status || "").trim()
  };

  if (normalizedEmployee.full_name.length < 3) {
    errors.full_name = "Full name must be at least 3 characters long.";
  }

  if (!isValidEmail(normalizedEmployee.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!isValidPhone(normalizedEmployee.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (!normalizedEmployee.department) {
    errors.department = "Department is required.";
  }

  if (!normalizedEmployee.job_role) {
    errors.job_role = "Job role is required.";
  }

  if (!Number.isFinite(normalizedEmployee.salary) || normalizedEmployee.salary < 0) {
    errors.salary = "Salary must be a valid non-negative number.";
  }

  if (!isValidDate(normalizedEmployee.joining_date)) {
    errors.joining_date = "Joining date must be a valid date in YYYY-MM-DD format.";
  }

  if (!VALID_STATUSES.includes(normalizedEmployee.status)) {
    errors.status = "Status must be Active, Inactive, or On Leave.";
  }

  return {
    errors,
    normalizedEmployee
  };
}

async function getEmployees(req, res) {
  try {
    const result = await db.listEmployees({
      search: req.query.search,
      department: req.query.department,
      page: req.query.page,
      limit: req.query.limit
    });

    return res.json(result);
  } catch (error) {
    console.error("Get employees error:", error);
    return res.status(500).json({ message: "Failed to load employees." });
  }
}

async function getEmployeeById(req, res) {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    const employee = await db.getEmployeeById(employeeId);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    return res.json(employee);
  } catch (error) {
    console.error("Get employee error:", error);
    return res.status(500).json({ message: "Failed to load employee details." });
  }
}

async function createEmployee(req, res) {
  const { errors, normalizedEmployee } = validateEmployeePayload(req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: "Validation failed.",
      errors
    });
  }

  try {
    const createdEmployee = await db.createEmployee(normalizedEmployee);

    return res.status(201).json({
      message: "Employee created successfully.",
      employee: createdEmployee
    });
  } catch (error) {
    if (error.code === "23505" || error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "An employee with this email already exists." });
    }

    console.error("Create employee error:", error);
    return res.status(500).json({ message: "Failed to create employee." });
  }
}

async function updateEmployee(req, res) {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    const existingEmployee = await db.getEmployeeById(employeeId);

    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const { errors, normalizedEmployee } = validateEmployeePayload(req.body);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: "Validation failed.",
        errors
      });
    }

    const updatedEmployee = await db.updateEmployee(employeeId, normalizedEmployee);

    return res.json({
      message: "Employee updated successfully.",
      employee: updatedEmployee
    });
  } catch (error) {
    if (error.code === "23505" || error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "An employee with this email already exists." });
    }

    console.error("Update employee error:", error);
    return res.status(500).json({ message: "Failed to update employee." });
  }
}

async function deleteEmployee(req, res) {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    const existingEmployee = await db.getEmployeeById(employeeId);

    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    await db.deleteEmployee(employeeId);

    return res.json({ message: "Employee deleted successfully." });
  } catch (error) {
    console.error("Delete employee error:", error);
    return res.status(500).json({ message: "Failed to delete employee." });
  }
}

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
};
