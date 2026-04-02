/**
 * Migration: backfill displayName from username, and set placeholder email
 * for users who have NULL email (so we can make email NOT NULL).
 *
 * Placeholder format: username@portfoligo.local
 * These users will be prompted to update their email via the banner.
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Backfill displayName from username where displayName is NULL or empty
const [rows] = await conn.execute(
  "SELECT id, username, displayName, email FROM users"
);

for (const row of rows) {
  const updates = [];
  const params = [];

  // Set displayName = username if missing
  if (!row.displayName) {
    updates.push("displayName = ?");
    params.push(row.username);
  }

  // Set placeholder email if missing
  if (!row.email) {
    updates.push("email = ?");
    params.push(`${row.username}@portfoligo.local`);
  }

  if (updates.length > 0) {
    params.push(row.id);
    await conn.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );
    console.log(`Updated user ${row.id} (${row.username}): ${updates.join(", ")}`);
  }
}

console.log("Migration complete.");
await conn.end();
