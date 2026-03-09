// Cache the authentication form element.
const authForm = document.getElementById("authForm");
// Cache the banner used to show login and signup messages.
const loginMessage = document.getElementById("loginMessage");
// Cache the submit button so its label and disabled state can be updated.
const authButton = document.getElementById("authButton");
// Cache the heading that changes between sign-in and sign-up modes.
const authTitle = document.getElementById("authTitle");
// Cache the description text that changes by mode.
const authDescription = document.getElementById("authDescription");
// Cache the helper text beneath the form fields.
const authHelperText = document.getElementById("authHelperText");
// Cache the confirm-password field wrapper so it can be shown or hidden.
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");
// Cache the confirm-password input element.
const confirmPasswordInput = document.getElementById("confirmPassword");
// Cache the sign-in/sign-up toggle buttons.
const toggleButtons = document.querySelectorAll(".toggle-button");

// Track whether the form is currently in sign-in or sign-up mode.
let authMode = "signin";

// Show a message banner with the supplied type.
function showMessage(message, type) {
  loginMessage.textContent = message;
  loginMessage.className = `message ${type}`;
}

// Reset the message banner back to its hidden state.
function hideMessage() {
  loginMessage.textContent = "";
  loginMessage.className = "message hidden";
}

// Switch the form UI between sign-in and sign-up modes.
function setMode(mode) {
  // Remember the active auth mode.
  authMode = mode;
  // Clear any old message before changing the UI.
  hideMessage();
  // Clear confirm-password whenever the mode changes.
  confirmPasswordInput.value = "";

  // Update the selected toggle button style.
  toggleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  // Configure the form for admin registration.
  if (mode === "signup") {
    authTitle.textContent = "Admin Sign Up";
    authDescription.textContent = "Create a new admin account to access the employee dashboard.";
    authHelperText.textContent = "Already have an admin account? Switch back to sign in.";
    confirmPasswordGroup.classList.remove("hidden");
    confirmPasswordInput.required = true;
    authButton.textContent = "Sign Up";
    return;
  }

  // Configure the form for normal sign-in.
  authTitle.textContent = "Admin Sign In";
  authDescription.textContent = "Use the seeded account or sign in with an existing admin account.";
  authHelperText.textContent = "New admin? Switch to sign up to create your account.";
  confirmPasswordGroup.classList.add("hidden");
  confirmPasswordInput.required = false;
  authButton.textContent = "Sign In";
}

// Validate that the supplied email has a basic correct structure.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Redirect already signed-in admins away from the login page.
async function checkExistingSession() {
  try {
    // Ask the backend whether the current session is authenticated.
    const response = await fetch("/api/auth/me");
    const result = await response.json();

    // Send authenticated users straight to the dashboard.
    if (result.authenticated) {
      window.location.href = "/";
    }
  } catch (error) {
    // Log session check failures but do not block manual sign-in.
    console.error("Session check failed:", error);
  }
}

// Change auth mode when either toggle button is clicked.
toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
  });
});

// Submit login or signup requests to the backend.
authForm.addEventListener("submit", async (event) => {
  // Prevent the browser from submitting the form normally.
  event.preventDefault();
  // Clear any old banner before validating the new submission.
  hideMessage();

  // Read and trim the current form values.
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  // Require both main credentials.
  if (!email || !password) {
    showMessage("Please enter both email and password.", "error");
    return;
  }

  // Validate the email format on the client.
  if (!isValidEmail(email)) {
    showMessage("Please enter a valid email address.", "error");
    return;
  }

  // Enforce the same minimum password length as the backend.
  if (password.length < 6) {
    showMessage("Password must be at least 6 characters long.", "error");
    return;
  }

  // Require matching passwords during sign-up.
  if (authMode === "signup" && password !== confirmPassword) {
    showMessage("Password and confirm password must match.", "error");
    return;
  }

  // Prevent duplicate submits and show an in-progress button label.
  authButton.disabled = true;
  authButton.textContent = authMode === "signup" ? "Signing Up..." : "Signing In...";

  try {
    // Send the request to the matching auth endpoint based on the active mode.
    const response = await fetch(
      authMode === "signup" ? "/api/auth/register" : "/api/auth/login",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
        body: JSON.stringify({ email, password, confirmPassword })
      }
    );

    // Parse the API response body.
    const result = await response.json();

    // Show a helpful error message when authentication fails.
    if (!response.ok) {
      showMessage(
        result.message || (authMode === "signup" ? "Sign up failed." : "Login failed."),
        "error"
      );
      return;
    }

    // Show a success message before redirecting to the dashboard.
    showMessage(
      result.message || (authMode === "signup" ? "Sign up successful. Redirecting..." : "Login successful. Redirecting..."),
      "success"
    );

    // Give the user a short moment to read the success state before navigation.
    setTimeout(() => {
      window.location.href = "/";
    }, 700);
  } catch (error) {
    // Report network or unexpected client errors.
    console.error("Authentication request failed:", error);
    showMessage("Unable to connect to the server.", "error");
  } finally {
    // Restore the button state after the request finishes.
    authButton.disabled = false;
    authButton.textContent = authMode === "signup" ? "Sign Up" : "Sign In";
  }
});

// Start in sign-in mode by default.
setMode("signin");
// Redirect immediately if the admin already has an active session.
checkExistingSession();
