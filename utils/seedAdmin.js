// Import bcrypt so the seeded admin password can be stored as a hash.
const bcrypt = require("bcryptjs");

// Create the default admin account only when one does not already exist.
async function seedAdmin(store) {
  // Read the seed credentials from the environment and fall back to the built-in defaults.
  const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@example.com";
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";

  // Check whether the default admin already exists in storage.
  const existingAdmin = await store.findAdminByEmail(defaultEmail);

  // Stop here if the admin has already been created previously.
  if (existingAdmin) {
    return;
  }

  // Hash the default password before inserting the admin record.
  const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
  // Save the default admin through the provided store implementation.
  await store.createAdmin(defaultEmail, hashedPassword);

  // Log the seeded credentials so local developers can sign in easily.
  console.log(`Default admin seeded: ${defaultEmail} / ${defaultPassword}`);
}

// Export the seeding helper so the database layer can call it during startup.
module.exports = seedAdmin;
