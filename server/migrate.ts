/**
 * Startup migration runner.
 * Reads all SQL files from drizzle/ and runs them against the database.
 * Uses IF NOT EXISTS / CREATE TABLE IF NOT EXISTS semantics so it's safe to run repeatedly.
 * This runs automatically on server startup so Railway deployments self-migrate.
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

export async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[migrate] DATABASE_URL not set, skipping migrations");
    return;
  }

  let connection: mysql.Connection | null = null;
  try {
    const url = new URL(dbUrl);
    connection = await mysql.createConnection({
      host: url.hostname,
      port: parseInt(url.port || "3306"),
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      ssl: url.hostname.includes("railway.internal") ? undefined : { rejectUnauthorized: false },
      connectTimeout: 15000,
      multipleStatements: true,
    });

    console.log("[migrate] Connected to database");

    // Find migration files relative to this file's location at build time
    // In production the bundle is at dist/index.js, migrations are at dist/drizzle/ (copied by build)
    // We'll look in multiple possible locations
    const possibleDirs = [
      // Production: migrations copied next to bundle
      join(process.cwd(), "drizzle"),
      join(process.cwd(), "dist", "drizzle"),
      // Development: source directory
      join(process.cwd(), "drizzle"),
    ];

    let migrationFiles: string[] = [];
    for (const dir of possibleDirs) {
      try {
        const files = readdirSync(dir)
          .filter((f) => f.endsWith(".sql"))
          .sort()
          .map((f) => join(dir, f));
        if (files.length > 0) {
          migrationFiles = files;
          console.log(`[migrate] Found ${files.length} migration file(s) in ${dir}`);
          break;
        }
      } catch {
        // directory doesn't exist, try next
      }
    }

    if (migrationFiles.length === 0) {
      console.warn("[migrate] No SQL migration files found, skipping");
      return;
    }

    // Create migrations tracking table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hash VARCHAR(255) NOT NULL UNIQUE,
        created_at BIGINT
      )
    `);

    for (const sqlFile of migrationFiles) {
      const hash = sqlFile.split("/").pop()!.replace(".sql", "");
      
      // Check if already applied
      const [rows] = await connection.execute(
        "SELECT id FROM __drizzle_migrations WHERE hash = ?",
        [hash]
      );
      if ((rows as any[]).length > 0) {
        console.log(`[migrate] Already applied: ${hash}`);
        continue;
      }

      console.log(`[migrate] Applying: ${hash}`);
      const rawSql = readFileSync(sqlFile, "utf8");
      // Drizzle uses "--> statement-breakpoint" as a delimiter between statements.
      // Split on that, then also split on semicolons, and strip SQL comments.
      const statements = rawSql
        .split(/--> statement-breakpoint/)
        .flatMap(chunk => chunk.split(";"))
        .map(s => s.replace(/--[^\n]*/g, "").trim())
        .filter(s => s.length > 5);

      try {
        for (const stmt of statements) {
          await connection.execute(stmt);
        }
        await connection.execute(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
          [hash, Date.now()]
        );
        console.log(`[migrate] Applied: ${hash}`);
      } catch (e: any) {
        // If it's a "table already exists" error, mark as applied and continue
        if (
          e.code === "ER_TABLE_EXISTS_ERROR" ||
          e.code === "ER_DUP_FIELDNAME" ||
          (e.message && e.message.includes("already exists"))
        ) {
          console.log(`[migrate] Schema already exists for ${hash}, marking as applied`);
          await connection.execute(
            "INSERT IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
            [hash, Date.now()]
          );
        } else {
          console.error(`[migrate] Failed to apply ${hash}:`, e.message);
          throw e;
        }
      }
    }

    console.log("[migrate] All migrations complete");
  } catch (e: any) {
    console.error("[migrate] Migration error:", e.message);
    // Don't crash the server if migrations fail — log and continue
    // The app will show DB errors but at least starts up
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}
