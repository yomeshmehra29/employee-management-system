// Keep all list filter and pagination state in one shared object.
const state = {
  // Track the current page shown in the employee table.
  page: 1,
  // Track how many rows to request per page.
  limit: 10,
  // Track the active text search query.
  search: "",
  // Track the selected department filter.
  department: "",
  // Store the latest pagination metadata returned by the API.
  pagination: null
};

// Cache the table body so employee rows can be rendered efficiently.
const employeeTableBody = document.getElementById("employeeTableBody");
// Cache the main banner area used for app-level success and error messages.
const appMessage = document.getElementById("appMessage");
// Cache the banner area inside the modal form.
const formMessage = document.getElementById("formMessage");
// Cache the empty-state element shown when no employees match the filters.
const emptyState = document.getElementById("emptyState");
// Cache the search input used to filter employees.
const searchInput = document.getElementById("searchInput");
// Cache the department dropdown filter.
const departmentFilter = document.getElementById("departmentFilter");
// Cache the page-size selector.
const limitSelect = document.getElementById("limitSelect");
// Cache the text element that displays pagination details.
const paginationInfo = document.getElementById("paginationInfo");
// Cache the previous-page button.
const prevPageButton = document.getElementById("prevPageButton");
// Cache the next-page button.
const nextPageButton = document.getElementById("nextPageButton");
// Cache the dashboard stat that shows the total employee count.
const totalEmployees = document.getElementById("totalEmployees");
// Cache the dashboard stat that shows how many departments exist.
const totalDepartments = document.getElementById("totalDepartments");
// Cache the UI element that shows the signed-in admin email.
const adminEmail = document.getElementById("adminEmail");
// Cache the logout button.
const logoutButton = document.getElementById("logoutButton");
// Cache the employee modal wrapper.
const employeeModal = document.getElementById("employeeModal");
// Cache the add/edit employee form.
const employeeForm = document.getElementById("employeeForm");
// Cache the modal title element so it can change between add and edit modes.
const modalTitle = document.getElementById("modalTitle");
// Cache the modal subtitle element.
const modalSubtitle = document.getElementById("modalSubtitle");
// Cache the hidden input that stores the current employee ID while editing.
const employeeIdInput = document.getElementById("employeeId");
// Cache the form submit button so its label and disabled state can be updated.
const saveEmployeeButton = document.getElementById("saveEmployeeButton");

// Hold the debounce timer used by the search input.
let searchTimer = null;

// Show a success or error banner inside the supplied message element.
function showBanner(element, message, type) {
  element.textContent = message;
  element.className = `message ${type}`;
}

// Reset a banner back to its hidden state.
function hideBanner(element) {
  element.textContent = "";
  element.className = "message hidden";
}

// Escape user-provided values before injecting them into HTML strings.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Format salary numbers as US currency for display in the table.
function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

// Format ISO date strings into a readable short date for the UI.
function formatDate(value) {
  // Show a placeholder when the value is missing.
  if (!value) {
    return "-";
  }

  // Parse the value into a Date object.
  const date = new Date(value);

  // Fall back to the original value when parsing fails.
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  // Format valid dates in a concise month/day/year style.
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

// Convert a status label into the matching CSS class name.
function getStatusClass(status) {
  const normalizedStatus = String(status).toLowerCase().replace(/\s+/g, "-");
  return `status-badge status-${normalizedStatus}`;
}

// Remove old field-level validation messages and error styles.
function clearFieldErrors() {
  // Clear every inline error container.
  document.querySelectorAll(".field-error").forEach((field) => {
    field.textContent = "";
  });

  // Remove the error border class from all inputs and selects in the form.
  employeeForm.querySelectorAll("input, select").forEach((input) => {
    input.classList.remove("input-error");
  });
}

// Display field-level validation messages returned by the client or server.
function showFieldErrors(errors) {
  // Start from a clean form state.
  clearFieldErrors();

  // Match each error message to its field and inline error element.
  Object.entries(errors).forEach(([field, message]) => {
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);
    const input = employeeForm.querySelector(`[name="${field}"]`);

    // Show the error text when a matching placeholder exists.
    if (errorElement) {
      errorElement.textContent = message;
    }

    // Highlight the related input when it exists.
    if (input) {
      input.classList.add("input-error");
    }
  });
}

// Validate the employee form on the client before sending it to the API.
function validateEmployeeForm(payload) {
  // Collect validation messages keyed by field name.
  const errors = {};

  // Require a full name with at least three characters.
  if (payload.full_name.trim().length < 3) {
    errors.full_name = "Full name must be at least 3 characters.";
  }

  // Require a valid email shape.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.email = "Enter a valid email address.";
  }

  // Require a phone number that matches the accepted pattern.
  if (!/^[0-9+\-() ]{7,20}$/.test(payload.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  // Require a department value.
  if (!payload.department.trim()) {
    errors.department = "Department is required.";
  }

  // Require a job role value.
  if (!payload.job_role.trim()) {
    errors.job_role = "Job role is required.";
  }

  // Require salary to be numeric and non-negative.
  if (Number.isNaN(Number(payload.salary)) || Number(payload.salary) < 0) {
    errors.salary = "Salary must be a valid non-negative number.";
  }

  // Require a valid calendar date in YYYY-MM-DD format.
  if (!isValidDateString(payload.joining_date)) {
    errors.joining_date = "Joining date must be a valid date in YYYY-MM-DD format.";
  }

  // Require one of the supported employee statuses.
  if (!["Active", "Inactive", "On Leave"].includes(payload.status)) {
    errors.status = "Please choose a valid status.";
  }

  // Return the accumulated validation errors.
  return errors;
}

// Read the current form field values and normalize them into an API payload.
function collectFormData() {
  return {
    full_name: document.getElementById("full_name").value.trim(),
    email: document.getElementById("employee_email").value.trim().toLowerCase(),
    phone: document.getElementById("phone").value.trim(),
    department: document.getElementById("department").value.trim(),
    job_role: document.getElementById("job_role").value.trim(),
    salary: document.getElementById("salary").value.trim(),
    joining_date: document.getElementById("joining_date").value,
    status: document.getElementById("status").value
  };
}

// Validate that a date string matches YYYY-MM-DD and represents a real date.
function isValidDateString(value) {
  // Reject values that do not match the expected format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  // Parse the string as a UTC date to avoid timezone offsets.
  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  // Accept the date only if the parsed parts match the original input.
  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

// Reset the employee form so the modal opens in a clean state.
function resetEmployeeForm() {
  // Clear all input values back to their defaults.
  employeeForm.reset();
  // Remove any hidden employee ID from previous edit sessions.
  employeeIdInput.value = "";
  // Default new employees to Active status.
  document.getElementById("status").value = "Active";
  // Remove old validation messages and styling.
  clearFieldErrors();
  // Hide any old banner message inside the modal.
  hideBanner(formMessage);
}

// Open the modal in either add or edit mode.
function openModal(employee = null) {
  // Always start from a clean form state.
  resetEmployeeForm();

  // Populate the form when editing an existing employee.
  if (employee) {
    modalTitle.textContent = "Edit Employee";
    modalSubtitle.textContent = "Update this employee record.";
    employeeIdInput.value = employee.id;
    document.getElementById("full_name").value = employee.full_name;
    document.getElementById("employee_email").value = employee.email;
    document.getElementById("phone").value = employee.phone;
    document.getElementById("department").value = employee.department;
    document.getElementById("job_role").value = employee.job_role;
    document.getElementById("salary").value = employee.salary;
    document.getElementById("joining_date").value = employee.joining_date;
    document.getElementById("status").value = employee.status;
    saveEmployeeButton.textContent = "Update Employee";
  } else {
    // Set add-mode labels when no employee is supplied.
    modalTitle.textContent = "Add Employee";
    modalSubtitle.textContent = "Create a new employee record.";
    saveEmployeeButton.textContent = "Save Employee";
  }

  // Make the modal visible and accessible to assistive technology.
  employeeModal.classList.remove("hidden");
  employeeModal.setAttribute("aria-hidden", "false");
}

// Hide the employee modal.
function closeModal() {
  employeeModal.classList.add("hidden");
  employeeModal.setAttribute("aria-hidden", "true");
}

// Rebuild the department filter options from the latest API response.
function renderDepartmentOptions(departments) {
  // Preserve the currently selected department while rebuilding the dropdown.
  const currentValue = state.department;

  // Start with the default "all departments" option.
  departmentFilter.innerHTML = '<option value="">All Departments</option>';

  // Add one option per distinct department.
  departments.forEach((department) => {
    const option = document.createElement("option");
    option.value = department;
    option.textContent = department;
    departmentFilter.appendChild(option);
  });

  // Restore the previously selected filter value.
  departmentFilter.value = currentValue;
  // Update the department count statistic.
  totalDepartments.textContent = departments.length;
}

// Render the employee list into the table body.
function renderEmployees(employees) {
  // Show the empty state when no employees are returned.
  if (employees.length === 0) {
    employeeTableBody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  // Hide the empty state when rows are available.
  emptyState.classList.add("hidden");

  // Generate one HTML row per employee record.
  employeeTableBody.innerHTML = employees
    .map((employee) => {
      return `
        <tr>
          <td data-label="Name">${escapeHtml(employee.full_name)}</td>
          <td data-label="Email">${escapeHtml(employee.email)}</td>
          <td data-label="Phone">${escapeHtml(employee.phone)}</td>
          <td data-label="Department">${escapeHtml(employee.department)}</td>
          <td data-label="Job Role">${escapeHtml(employee.job_role)}</td>
          <td data-label="Salary">${formatCurrency(employee.salary)}</td>
          <td data-label="Joining Date">${formatDate(employee.joining_date)}</td>
          <td data-label="Status">
            <span class="${getStatusClass(employee.status)}">${escapeHtml(employee.status)}</span>
          </td>
          <td data-label="Updated">${formatDate(employee.updated_at)}</td>
          <td data-label="Actions">
            <div class="row-actions">
              <button class="btn btn-secondary" data-action="edit" data-id="${employee.id}">
                Edit
              </button>
              <button class="btn btn-danger" data-action="delete" data-id="${employee.id}" data-name="${escapeHtml(
                employee.full_name
              )}">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Update the pagination controls and summary values.
function updatePagination(pagination) {
  // Save the latest pagination metadata in shared state.
  state.pagination = pagination;
  // Keep the current page number in sync with the backend.
  state.page = pagination.page;
  // Show the current page and total page count.
  paginationInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
  // Disable navigation buttons when no previous or next page exists.
  prevPageButton.disabled = !pagination.hasPreviousPage;
  nextPageButton.disabled = !pagination.hasNextPage;
  // Update the total employee count in the dashboard.
  totalEmployees.textContent = pagination.totalItems;
}

// Fetch employees from the API using the current filters and page settings.
async function fetchEmployees() {
  // Clear old app-level messages before loading fresh data.
  hideBanner(appMessage);

  try {
    // Serialize the current filters and pagination into a query string.
    const query = new URLSearchParams({
      search: state.search,
      department: state.department,
      page: String(state.page),
      limit: String(state.limit)
    });

    // Request the employee list from the protected API.
    const response = await fetch(`/api/employees?${query.toString()}`);

    // Redirect to login if the server says the session is no longer valid.
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    // Parse the JSON body returned by the API.
    const result = await response.json();

    // Show a banner if the request failed.
    if (!response.ok) {
      showBanner(appMessage, result.message || "Failed to load employees.", "error");
      return;
    }

    // Re-render the filter options, table rows, and pagination from the response.
    renderDepartmentOptions(result.departments || []);
    renderEmployees(result.data || []);
    updatePagination(result.pagination);
  } catch (error) {
    // Log network or parsing failures and notify the user.
    console.error("Fetch employees failed:", error);
    showBanner(appMessage, "Unable to connect to the server.", "error");
  }
}

// Confirm the current session is authenticated before loading the dashboard.
async function checkAuth() {
  try {
    // Ask the auth API whether an admin is currently signed in.
    const response = await fetch("/api/auth/me");
    const result = await response.json();

    // Redirect anonymous visitors to the login page.
    if (!result.authenticated) {
      window.location.href = "/login";
      return false;
    }

    // Show the signed-in admin email in the header.
    adminEmail.textContent = result.admin.email;
    return true;
  } catch (error) {
    // Treat auth check failures as unauthenticated states.
    console.error("Auth check failed:", error);
    window.location.href = "/login";
    return false;
  }
}

// Submit the add/edit employee form to the API.
async function handleSaveEmployee(event) {
  // Stop the browser from doing a full page reload.
  event.preventDefault();
  // Clear previous form messages and field errors.
  hideBanner(formMessage);
  clearFieldErrors();

  // Determine whether this is an add or edit operation.
  const employeeId = employeeIdInput.value;
  // Build the request payload from the form fields.
  const payload = collectFormData();
  // Run client-side validation before calling the API.
  const frontendErrors = validateEmployeeForm(payload);

  // Show validation errors immediately when present.
  if (Object.keys(frontendErrors).length > 0) {
    showFieldErrors(frontendErrors);
    showBanner(formMessage, "Please fix the highlighted fields.", "error");
    return;
  }

  // Prevent duplicate submissions while the request is in flight.
  saveEmployeeButton.disabled = true;
  saveEmployeeButton.textContent = employeeId ? "Updating..." : "Saving...";

  try {
    // Send either a POST or PUT request depending on whether an employee ID exists.
    const response = await fetch(employeeId ? `/api/employees/${employeeId}` : "/api/employees", {
      method: employeeId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // Parse the API response body.
    const result = await response.json();

    // Show backend validation errors or general failures when the request was rejected.
    if (!response.ok) {
      if (result.errors) {
        showFieldErrors(result.errors);
      }

      showBanner(formMessage, result.message || "Unable to save employee.", "error");
      return;
    }

    // Close the modal, refresh the table, and show the success banner.
    closeModal();
    state.page = 1;
    await fetchEmployees();
    showBanner(appMessage, result.message, "success");
  } catch (error) {
    // Report network or unexpected client errors.
    console.error("Save employee failed:", error);
    showBanner(formMessage, "Unable to connect to the server.", "error");
  } finally {
    // Restore the button to its normal state regardless of outcome.
    saveEmployeeButton.disabled = false;
    saveEmployeeButton.textContent = employeeId ? "Update Employee" : "Save Employee";
  }
}

// Load one employee from the API and open the edit modal with its data.
async function handleEditEmployee(employeeId) {
  // Clear any previous app-level messages.
  hideBanner(appMessage);

  try {
    // Request the latest employee data before editing.
    const response = await fetch(`/api/employees/${employeeId}`);
    const result = await response.json();

    // Show an error banner if the employee could not be loaded.
    if (!response.ok) {
      showBanner(appMessage, result.message || "Failed to load employee details.", "error");
      return;
    }

    // Open the modal with the fetched employee values prefilled.
    openModal(result);
  } catch (error) {
    // Report network or unexpected client errors.
    console.error("Edit employee failed:", error);
    showBanner(appMessage, "Unable to connect to the server.", "error");
  }
}

// Confirm and then delete an employee record.
async function handleDeleteEmployee(employeeId, employeeName) {
  // Ask for confirmation before making a destructive change.
  const confirmed = window.confirm(`Delete employee "${employeeName}"? This action cannot be undone.`);

  // Abort the deletion when the user cancels.
  if (!confirmed) {
    return;
  }

  // Clear old app messages before running the delete request.
  hideBanner(appMessage);

  try {
    // Send the DELETE request to the employee API.
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "DELETE"
    });
    const result = await response.json();

    // Show an error banner if the delete request failed.
    if (!response.ok) {
      showBanner(appMessage, result.message || "Failed to delete employee.", "error");
      return;
    }

    // Move back one page when the last row on a non-first page was deleted.
    if (state.pagination && state.pagination.page > 1 && employeeTableBody.children.length === 1) {
      state.page -= 1;
    }

    // Refresh the list and show the success banner.
    await fetchEmployees();
    showBanner(appMessage, result.message, "success");
  } catch (error) {
    // Report network or unexpected client errors.
    console.error("Delete employee failed:", error);
    showBanner(appMessage, "Unable to connect to the server.", "error");
  }
}

// Tell the server to destroy the session, then send the user back to login.
async function handleLogout() {
  try {
    // Attempt to destroy the session on the server.
    await fetch("/api/auth/logout", {
      method: "POST"
    });
  } catch (error) {
    // Log the failure, but still redirect away from the protected page.
    console.error("Logout failed:", error);
  } finally {
    // Always return the user to the login screen.
    window.location.href = "/login";
  }
}

// Open the modal in add mode when the primary action button is clicked.
document.getElementById("openAddModalButton").addEventListener("click", () => openModal());
// Close the modal when the close icon is clicked.
document.getElementById("closeModalButton").addEventListener("click", closeModal);
// Close the modal when the cancel button is clicked.
document.getElementById("cancelModalButton").addEventListener("click", closeModal);
// Submit the form through the save handler.
employeeForm.addEventListener("submit", handleSaveEmployee);
// Log out when the header button is clicked.
logoutButton.addEventListener("click", handleLogout);

// Close the modal when the user clicks on the backdrop outside the card.
employeeModal.addEventListener("click", (event) => {
  if (event.target === employeeModal) {
    closeModal();
  }
});

// Close the modal when Escape is pressed.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !employeeModal.classList.contains("hidden")) {
    closeModal();
  }
});

// Debounce search input so the API is not called on every keystroke instantly.
searchInput.addEventListener("input", (event) => {
  clearTimeout(searchTimer);

  // Wait briefly after typing stops before reloading the employee list.
  searchTimer = setTimeout(() => {
    state.search = event.target.value.trim();
    state.page = 1;
    fetchEmployees();
  }, 300);
});

// Reload employees when the department filter changes.
departmentFilter.addEventListener("change", (event) => {
  state.department = event.target.value;
  state.page = 1;
  fetchEmployees();
});

// Reload employees when the page-size selection changes.
limitSelect.addEventListener("change", (event) => {
  state.limit = Number(event.target.value);
  state.page = 1;
  fetchEmployees();
});

// Move to the previous page when possible.
prevPageButton.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    fetchEmployees();
  }
});

// Move to the next page when possible.
nextPageButton.addEventListener("click", () => {
  if (state.pagination && state.page < state.pagination.totalPages) {
    state.page += 1;
    fetchEmployees();
  }
});

// Handle edit and delete button clicks using event delegation on the table body.
employeeTableBody.addEventListener("click", (event) => {
  // Find the nearest action button that was clicked.
  const actionButton = event.target.closest("[data-action]");

  // Ignore clicks that did not come from an action button.
  if (!actionButton) {
    return;
  }

  // Read the requested action and the target employee ID from data attributes.
  const action = actionButton.dataset.action;
  const employeeId = actionButton.dataset.id;

  // Load the employee and open the modal in edit mode.
  if (action === "edit") {
    handleEditEmployee(employeeId);
  }

  // Confirm and delete the employee.
  if (action === "delete") {
    handleDeleteEmployee(employeeId, actionButton.dataset.name);
  }
});

// Run the initial auth check and first employee fetch when the page loads.
async function initializeApp() {
  // Verify that the admin session is still valid.
  const isAuthenticated = await checkAuth();

  // Stop here if the user was redirected to login.
  if (!isAuthenticated) {
    return;
  }

  // Load the first page of employees.
  await fetchEmployees();
}

// Start the dashboard logic immediately after the script loads.
initializeApp();
