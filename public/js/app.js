const state = {
  page: 1,
  limit: 10,
  search: "",
  department: "",
  pagination: null
};

const employeeTableBody = document.getElementById("employeeTableBody");
const appMessage = document.getElementById("appMessage");
const formMessage = document.getElementById("formMessage");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const departmentFilter = document.getElementById("departmentFilter");
const limitSelect = document.getElementById("limitSelect");
const paginationInfo = document.getElementById("paginationInfo");
const prevPageButton = document.getElementById("prevPageButton");
const nextPageButton = document.getElementById("nextPageButton");
const totalEmployees = document.getElementById("totalEmployees");
const totalDepartments = document.getElementById("totalDepartments");
const adminEmail = document.getElementById("adminEmail");
const logoutButton = document.getElementById("logoutButton");
const employeeModal = document.getElementById("employeeModal");
const employeeForm = document.getElementById("employeeForm");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const employeeIdInput = document.getElementById("employeeId");
const saveEmployeeButton = document.getElementById("saveEmployeeButton");

let searchTimer = null;

function showBanner(element, message, type) {
  element.textContent = message;
  element.className = `message ${type}`;
}

function hideBanner(element) {
  element.textContent = "";
  element.className = "message hidden";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function getStatusClass(status) {
  const normalizedStatus = String(status).toLowerCase().replace(/\s+/g, "-");
  return `status-badge status-${normalizedStatus}`;
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((field) => {
    field.textContent = "";
  });

  employeeForm.querySelectorAll("input, select").forEach((input) => {
    input.classList.remove("input-error");
  });
}

function showFieldErrors(errors) {
  clearFieldErrors();

  Object.entries(errors).forEach(([field, message]) => {
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);
    const input = employeeForm.querySelector(`[name="${field}"]`);

    if (errorElement) {
      errorElement.textContent = message;
    }

    if (input) {
      input.classList.add("input-error");
    }
  });
}

function validateEmployeeForm(payload) {
  const errors = {};

  if (payload.full_name.trim().length < 3) {
    errors.full_name = "Full name must be at least 3 characters.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!/^[0-9+\-() ]{7,20}$/.test(payload.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (!payload.department.trim()) {
    errors.department = "Department is required.";
  }

  if (!payload.job_role.trim()) {
    errors.job_role = "Job role is required.";
  }

  if (Number.isNaN(Number(payload.salary)) || Number(payload.salary) < 0) {
    errors.salary = "Salary must be a valid non-negative number.";
  }

  if (!isValidDateString(payload.joining_date)) {
    errors.joining_date = "Joining date must be a valid date in YYYY-MM-DD format.";
  }

  if (!["Active", "Inactive", "On Leave"].includes(payload.status)) {
    errors.status = "Please choose a valid status.";
  }

  return errors;
}

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

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

function resetEmployeeForm() {
  employeeForm.reset();
  employeeIdInput.value = "";
  document.getElementById("status").value = "Active";
  clearFieldErrors();
  hideBanner(formMessage);
}

function openModal(employee = null) {
  resetEmployeeForm();

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
    modalTitle.textContent = "Add Employee";
    modalSubtitle.textContent = "Create a new employee record.";
    saveEmployeeButton.textContent = "Save Employee";
  }

  employeeModal.classList.remove("hidden");
  employeeModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  employeeModal.classList.add("hidden");
  employeeModal.setAttribute("aria-hidden", "true");
}

function renderDepartmentOptions(departments) {
  const currentValue = state.department;

  departmentFilter.innerHTML = '<option value="">All Departments</option>';

  departments.forEach((department) => {
    const option = document.createElement("option");
    option.value = department;
    option.textContent = department;
    departmentFilter.appendChild(option);
  });

  departmentFilter.value = currentValue;
  totalDepartments.textContent = departments.length;
}

function renderEmployees(employees) {
  if (employees.length === 0) {
    employeeTableBody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

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

function updatePagination(pagination) {
  state.pagination = pagination;
  state.page = pagination.page;
  paginationInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
  prevPageButton.disabled = !pagination.hasPreviousPage;
  nextPageButton.disabled = !pagination.hasNextPage;
  totalEmployees.textContent = pagination.totalItems;
}

async function fetchEmployees() {
  hideBanner(appMessage);

  try {
    const query = new URLSearchParams({
      search: state.search,
      department: state.department,
      page: String(state.page),
      limit: String(state.limit)
    });

    const response = await fetch(`/api/employees?${query.toString()}`);

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      showBanner(appMessage, result.message || "Failed to load employees.", "error");
      return;
    }

    renderDepartmentOptions(result.departments || []);
    renderEmployees(result.data || []);
    updatePagination(result.pagination);
  } catch (error) {
    console.error("Fetch employees failed:", error);
    showBanner(appMessage, "Unable to connect to the server.", "error");
  }
}

async function checkAuth() {
  try {
    const response = await fetch("/api/auth/me");
    const result = await response.json();

    if (!result.authenticated) {
      window.location.href = "/login";
      return false;
    }

    adminEmail.textContent = result.admin.email;
    return true;
  } catch (error) {
    console.error("Auth check failed:", error);
    window.location.href = "/login";
    return false;
  }
}

async function handleSaveEmployee(event) {
  event.preventDefault();
  hideBanner(formMessage);
  clearFieldErrors();

  const employeeId = employeeIdInput.value;
  const payload = collectFormData();
  const frontendErrors = validateEmployeeForm(payload);

  if (Object.keys(frontendErrors).length > 0) {
    showFieldErrors(frontendErrors);
    showBanner(formMessage, "Please fix the highlighted fields.", "error");
    return;
  }

  saveEmployeeButton.disabled = true;
  saveEmployeeButton.textContent = employeeId ? "Updating..." : "Saving...";

  try {
    const response = await fetch(employeeId ? `/api/employees/${employeeId}` : "/api/employees", {
      method: employeeId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.errors) {
        showFieldErrors(result.errors);
      }

      showBanner(formMessage, result.message || "Unable to save employee.", "error");
      return;
    }

    closeModal();
    state.page = 1;
    await fetchEmployees();
    showBanner(appMessage, result.message, "success");
  } catch (error) {
    console.error("Save employee failed:", error);
    showBanner(formMessage, "Unable to connect to the server.", "error");
  } finally {
    saveEmployeeButton.disabled = false;
    saveEmployeeButton.textContent = employeeId ? "Update Employee" : "Save Employee";
  }
}

async function handleEditEmployee(employeeId) {
  hideBanner(appMessage);

  try {
    const response = await fetch(`/api/employees/${employeeId}`);
    const result = await response.json();

    if (!response.ok) {
      showBanner(appMessage, result.message || "Failed to load employee details.", "error");
      return;
    }

    openModal(result);
  } catch (error) {
    console.error("Edit employee failed:", error);
    showBanner(appMessage, "Unable to connect to the server.", "error");
  }
}

async function handleDeleteEmployee(employeeId, employeeName) {
  const confirmed = window.confirm(`Delete employee "${employeeName}"? This action cannot be undone.`);

  if (!confirmed) {
    return;
  }

  hideBanner(appMessage);

  try {
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "DELETE"
    });
    const result = await response.json();

    if (!response.ok) {
      showBanner(appMessage, result.message || "Failed to delete employee.", "error");
      return;
    }

    if (state.pagination && state.pagination.page > 1 && employeeTableBody.children.length === 1) {
      state.page -= 1;
    }

    await fetchEmployees();
    showBanner(appMessage, result.message, "success");
  } catch (error) {
    console.error("Delete employee failed:", error);
    showBanner(appMessage, "Unable to connect to the server.", "error");
  }
}

async function handleLogout() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST"
    });
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    window.location.href = "/login";
  }
}

document.getElementById("openAddModalButton").addEventListener("click", () => openModal());
document.getElementById("closeModalButton").addEventListener("click", closeModal);
document.getElementById("cancelModalButton").addEventListener("click", closeModal);
employeeForm.addEventListener("submit", handleSaveEmployee);
logoutButton.addEventListener("click", handleLogout);

employeeModal.addEventListener("click", (event) => {
  if (event.target === employeeModal) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !employeeModal.classList.contains("hidden")) {
    closeModal();
  }
});

searchInput.addEventListener("input", (event) => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    state.search = event.target.value.trim();
    state.page = 1;
    fetchEmployees();
  }, 300);
});

departmentFilter.addEventListener("change", (event) => {
  state.department = event.target.value;
  state.page = 1;
  fetchEmployees();
});

limitSelect.addEventListener("change", (event) => {
  state.limit = Number(event.target.value);
  state.page = 1;
  fetchEmployees();
});

prevPageButton.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    fetchEmployees();
  }
});

nextPageButton.addEventListener("click", () => {
  if (state.pagination && state.page < state.pagination.totalPages) {
    state.page += 1;
    fetchEmployees();
  }
});

employeeTableBody.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  const employeeId = actionButton.dataset.id;

  if (action === "edit") {
    handleEditEmployee(employeeId);
  }

  if (action === "delete") {
    handleDeleteEmployee(employeeId, actionButton.dataset.name);
  }
});

async function initializeApp() {
  const isAuthenticated = await checkAuth();

  if (!isAuthenticated) {
    return;
  }

  await fetchEmployees();
}

initializeApp();
