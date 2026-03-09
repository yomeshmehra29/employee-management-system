const bcrypt = require("bcryptjs");

async function seedAdmin(store) {
  const defaultEmail = "admin@example.com";
  const defaultPassword = "admin123";

  const existingAdmin = await store.findAdminByEmail(defaultEmail);

  if (existingAdmin) {
    return;
  }

  const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
  await store.createAdmin(defaultEmail, hashedPassword);

  console.log("Default admin seeded: admin@example.com / admin123");
}

module.exports = seedAdmin;
