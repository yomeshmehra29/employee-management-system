// Import Express so employee APIs can be grouped in their own router.
const express = require("express");
// Import the employee controller handlers for each CRUD operation.
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
} = require("../controllers/employeeController");
// Import auth middleware to protect every employee route.
const { requireAuth } = require("../middleware/auth");

// Create a dedicated router instance for employee endpoints.
const router = express.Router();

// Apply authentication to every route defined below.
router.use(requireAuth);

// Return a paginated, filterable employee list.
router.get("/", getEmployees);
// Return one employee by ID.
router.get("/:id", getEmployeeById);
// Create a new employee record.
router.post("/", createEmployee);
// Update an existing employee record.
router.put("/:id", updateEmployee);
// Delete an employee record.
router.delete("/:id", deleteEmployee);

// Export the router so server.js can mount it under /api/employees.
module.exports = router;
