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

function getEmployees(req, res) {
  const search = String(req.query.search || "").trim();
  const department = String(req.query.department || "").trim();
  const requestedPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const requestedLimit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const limit = Math.min(requestedLimit, 100);

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push(
      "(full_name LIKE ? OR email LIKE ? OR department LIKE ? OR job_role LIKE ?)"
    );
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (department) {
    whereClauses.push("LOWER(department) = LOWER(?)");
    params.push(department);
  }

  const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const totalResult = db
    .prepare(`SELECT COUNT(*) AS total FROM employees ${whereStatement}`)
    .get(...params);

  const totalItems = totalResult.total;
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * limit;

  const employees = db
    .prepare(
      `
        SELECT *
        FROM employees
        ${whereStatement}
        ORDER BY updated_at DESC, id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset);

  // Return department names to keep the filter dropdown in sync with the database.
  const departments = db
    .prepare("SELECT DISTINCT department FROM employees ORDER BY department ASC")
    .all()
    .map((item) => item.department);

  return res.json({
    data: employees,
    departments,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages
    }
  });
}

function getEmployeeById(req, res) {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  const employee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);

  if (!employee) {
    return res.status(404).json({ message: "Employee not found." });
  }

  return res.json(employee);
}

function createEmployee(req, res) {
  const { errors, normalizedEmployee } = validateEmployeePayload(req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: "Validation failed.",
      errors
    });
  }

  try {
    const insert = db.prepare(`
      INSERT INTO employees (
        full_name,
        email,
        phone,
        department,
        job_role,
        salary,
        joining_date,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insert.run(
      normalizedEmployee.full_name,
      normalizedEmployee.email,
      normalizedEmployee.phone,
      normalizedEmployee.department,
      normalizedEmployee.job_role,
      normalizedEmployee.salary,
      normalizedEmployee.joining_date,
      normalizedEmployee.status
    );

    const createdEmployee = db
      .prepare("SELECT * FROM employees WHERE id = ?")
      .get(result.lastInsertRowid);

    return res.status(201).json({
      message: "Employee created successfully.",
      employee: createdEmployee
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "An employee with this email already exists." });
    }

    console.error("Create employee error:", error);
    return res.status(500).json({ message: "Failed to create employee." });
  }
}

function updateEmployee(req, res) {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  const existingEmployee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);

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

  try {
    const update = db.prepare(`
      UPDATE employees
      SET
        full_name = ?,
        email = ?,
        phone = ?,
        department = ?,
        job_role = ?,
        salary = ?,
        joining_date = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    update.run(
      normalizedEmployee.full_name,
      normalizedEmployee.email,
      normalizedEmployee.phone,
      normalizedEmployee.department,
      normalizedEmployee.job_role,
      normalizedEmployee.salary,
      normalizedEmployee.joining_date,
      normalizedEmployee.status,
      employeeId
    );

    const updatedEmployee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);

    return res.json({
      message: "Employee updated successfully.",
      employee: updatedEmployee
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "An employee with this email already exists." });
    }

    console.error("Update employee error:", error);
    return res.status(500).json({ message: "Failed to update employee." });
  }
}

function deleteEmployee(req, res) {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  const existingEmployee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);

  if (!existingEmployee) {
    return res.status(404).json({ message: "Employee not found." });
  }

  db.prepare("DELETE FROM employees WHERE id = ?").run(employeeId);

  return res.json({ message: "Employee deleted successfully." });
}

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
};
