const authForm = document.getElementById("authForm");
const loginMessage = document.getElementById("loginMessage");
const authButton = document.getElementById("authButton");
const authTitle = document.getElementById("authTitle");
const authDescription = document.getElementById("authDescription");
const authHelperText = document.getElementById("authHelperText");
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");
const confirmPasswordInput = document.getElementById("confirmPassword");
const toggleButtons = document.querySelectorAll(".toggle-button");

let authMode = "signin";

function showMessage(message, type) {
  loginMessage.textContent = message;
  loginMessage.className = `message ${type}`;
}

function hideMessage() {
  loginMessage.textContent = "";
  loginMessage.className = "message hidden";
}

function setMode(mode) {
  authMode = mode;
  hideMessage();
  confirmPasswordInput.value = "";

  toggleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  if (mode === "signup") {
    authTitle.textContent = "Admin Sign Up";
    authDescription.textContent = "Create a new admin account to access the employee dashboard.";
    authHelperText.textContent = "Already have an admin account? Switch back to sign in.";
    confirmPasswordGroup.classList.remove("hidden");
    confirmPasswordInput.required = true;
    authButton.textContent = "Sign Up";
    return;
  }

  authTitle.textContent = "Admin Sign In";
  authDescription.textContent = "Use the seeded account or sign in with an existing admin account.";
  authHelperText.textContent = "New admin? Switch to sign up to create your account.";
  confirmPasswordGroup.classList.add("hidden");
  confirmPasswordInput.required = false;
  authButton.textContent = "Sign In";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function checkExistingSession() {
  try {
    const response = await fetch("/api/auth/me");
    const result = await response.json();

    if (result.authenticated) {
      window.location.href = "/";
    }
  } catch (error) {
    console.error("Session check failed:", error);
  }
}

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
  });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  if (!email || !password) {
    showMessage("Please enter both email and password.", "error");
    return;
  }

  if (!isValidEmail(email)) {
    showMessage("Please enter a valid email address.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must be at least 6 characters long.", "error");
    return;
  }

  if (authMode === "signup" && password !== confirmPassword) {
    showMessage("Password and confirm password must match.", "error");
    return;
  }

  authButton.disabled = true;
  authButton.textContent = authMode === "signup" ? "Signing Up..." : "Signing In...";

  try {
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

    const result = await response.json();

    if (!response.ok) {
      showMessage(
        result.message || (authMode === "signup" ? "Sign up failed." : "Login failed."),
        "error"
      );
      return;
    }

    showMessage(
      result.message || (authMode === "signup" ? "Sign up successful. Redirecting..." : "Login successful. Redirecting..."),
      "success"
    );

    setTimeout(() => {
      window.location.href = "/";
    }, 700);
  } catch (error) {
    console.error("Authentication request failed:", error);
    showMessage("Unable to connect to the server.", "error");
  } finally {
    authButton.disabled = false;
    authButton.textContent = authMode === "signup" ? "Sign Up" : "Sign In";
  }
});

setMode("signin");
checkExistingSession();
