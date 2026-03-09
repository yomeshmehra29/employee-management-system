// Import the database abstraction used by all employee CRUD handlers.
const db = require("../config/db");

// Keep the allowed employee status values in one place for validation reuse.
const VALID_STATUSES = ["Active", "Inactive", "On Leave"];

// Validate email format before saving or updating an employee.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate phone numbers with a permissive pattern suitable for common formats.
function isValidPhone(phone) {
  return /^[0-9+\-() ]{7,20}$/.test(phone);
}

// Confirm the date is both correctly formatted and actually exists on the calendar.
function isValidDate(date) {
  // Enforce the YYYY-MM-DD structure first.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  // Parse the date components as UTC to avoid timezone shifts.
  const [year, month, day] = date.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  // Accept the date only if the parsed value matches the original components.
  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

// Normalize incoming employee data and collect validation errors.
function validateEmployeePayload(payload) {
  // Store field-specific validation messages here.
  const errors = {};
  // Trim and normalize all values before validation and database writes.
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

  // Require a meaningful employee name.
  if (normalizedEmployee.full_name.length < 3) {
    errors.full_name = "Full name must be at least 3 characters long.";
  }

  // Ensure email follows a basic valid format.
  if (!isValidEmail(normalizedEmployee.email)) {
    errors.email = "Enter a valid email address.";
  }

  // Ensure phone follows the accepted pattern.
  if (!isValidPhone(normalizedEmployee.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  // Department is required for categorization and filtering.
  if (!normalizedEmployee.department) {
    errors.department = "Department is required.";
  }

  // Job role is required so the record is meaningful.
  if (!normalizedEmployee.job_role) {
    errors.job_role = "Job role is required.";
  }

  // Salary must be a numeric non-negative value.
  if (!Number.isFinite(normalizedEmployee.salary) || normalizedEmployee.salary < 0) {
    errors.salary = "Salary must be a valid non-negative number.";
  }

  // Joining date must be a valid calendar date.
  if (!isValidDate(normalizedEmployee.joining_date)) {
    errors.joining_date = "Joining date must be a valid date in YYYY-MM-DD format.";
  }

  // Status must match one of the predefined values.
  if (!VALID_STATUSES.includes(normalizedEmployee.status)) {
    errors.status = "Status must be Active, Inactive, or On Leave.";
  }

  // Return both the cleaned data and any errors found.
  return {
    errors,
    normalizedEmployee
  };
}

// Return the paginated employee list, plus filters and pagination metadata.
async function getEmployees(req, res) {
  try {
    // Pass search and pagination parameters straight through to the data layer.
    const result = await db.listEmployees({
      search: req.query.search,
      department: req.query.department,
      page: req.query.page,
      limit: req.query.limit
    });

    // Send the formatted employee list to the client.
    return res.json(result);
  } catch (error) {
    // Log failures and return a generic server error.
    console.error("Get employees error:", error);
    return res.status(500).json({ message: "Failed to load employees." });
  }
}

// Return one employee record by its database-specific ID.
async function getEmployeeById(req, res) {
  // Normalize the route parameter into the correct ID format for the active database.
  const employeeId = db.normalizeEmployeeId(req.params.id);

  // Reject malformed IDs before touching the database.
  if (!employeeId) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    // Load the requested employee from storage.
    const employee = await db.getEmployeeById(employeeId);

    // Return 404 if the record does not exist.
    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    // Return the employee data.
    return res.json(employee);
  } catch (error) {
    // Log unexpected issues during lookup.
    console.error("Get employee error:", error);
    return res.status(500).json({ message: "Failed to load employee details." });
  }
}

// Create a new employee after validating the submitted payload.
async function createEmployee(req, res) {
  // Validate and normalize the request body before saving.
  const { errors, normalizedEmployee } = validateEmployeePayload(req.body);

  // Return all validation errors at once to the frontend.
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      message: "Validation failed.",
      errors
    });
  }

  try {
    // Persist the new employee record.
    const createdEmployee = await db.createEmployee(normalizedEmployee);

    // Return the created employee and a success message.
    return res.status(201).json({
      message: "Employee created successfully.",
      employee: createdEmployee
    });
  } catch (error) {
    // Handle duplicate email errors cleanly across MongoDB, Postgres, and SQLite.
    if (
      error.code === 11000 ||
      error.code === "23505" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res.status(409).json({ message: "An employee with this email already exists." });
    }

    // Log other failures and return a generic error.
    console.error("Create employee error:", error);
    return res.status(500).json({ message: "Failed to create employee." });
  }
}

// Update an existing employee record by ID.
async function updateEmployee(req, res) {
  // Normalize the route parameter into the correct ID format for the active database.
  const employeeId = db.normalizeEmployeeId(req.params.id);

  // Reject malformed IDs before touching the database.
  if (!employeeId) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    // Confirm the employee exists before attempting an update.
    const existingEmployee = await db.getEmployeeById(employeeId);

    // Return 404 for unknown employee IDs.
    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    // Validate the replacement payload.
    const { errors, normalizedEmployee } = validateEmployeePayload(req.body);

    // Return validation feedback when any field is invalid.
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: "Validation failed.",
        errors
      });
    }

    // Save the updated employee data.
    const updatedEmployee = await db.updateEmployee(employeeId, normalizedEmployee);

    // Return the updated record to the frontend.
    return res.json({
      message: "Employee updated successfully.",
      employee: updatedEmployee
    });
  } catch (error) {
    // Handle duplicate email collisions cleanly across MongoDB, Postgres, and SQLite.
    if (
      error.code === 11000 ||
      error.code === "23505" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res.status(409).json({ message: "An employee with this email already exists." });
    }

    // Log other errors for debugging.
    console.error("Update employee error:", error);
    return res.status(500).json({ message: "Failed to update employee." });
  }
}

// Delete an employee record by ID.
async function deleteEmployee(req, res) {
  // Normalize the route parameter into the correct ID format for the active database.
  const employeeId = db.normalizeEmployeeId(req.params.id);

  // Reject malformed IDs before querying the database.
  if (!employeeId) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    // Confirm the employee exists before deletion.
    const existingEmployee = await db.getEmployeeById(employeeId);

    // Return 404 if the employee does not exist.
    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    // Remove the employee record.
    await db.deleteEmployee(employeeId);

    // Confirm deletion to the client.
    return res.json({ message: "Employee deleted successfully." });
  } catch (error) {
    // Log deletion failures and return a generic error.
    console.error("Delete employee error:", error);
    return res.status(500).json({ message: "Failed to delete employee." });
  }
}

// Export the employee handlers for route registration.
module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
};
