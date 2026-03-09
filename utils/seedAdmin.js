const bcrypt = require("bcryptjs");

function seedAdmin(db) {
  const defaultEmail = "admin@example.com";
  const defaultPassword = "admin123";

  const existingAdmin = db
    .prepare("SELECT id FROM admins WHERE email = ?")
    .get(defaultEmail);

  if (existingAdmin) {
    return;
  }

  const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

  db.prepare(`
    INSERT INTO admins (email, password, created_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(defaultEmail, hashedPassword);

  console.log("Default admin seeded: admin@example.com / admin123");
}

module.exports = seedAdmin;
