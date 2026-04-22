/**
 * Backfill startingCapital for existing sleeves.
 *
 * For each sleeve:
 *   startingCapital = allocatedCapital - sum of challenge bumps received
 *
 * Challenge bumps are tracked in challenge_entries (isWinner=1, allocationBump from challenges).
 * We also subtract any admin cash adjustments that were positive (added capital), since those
 * also inflate allocatedCapital beyond the original starting amount.
 *
 * If the computed startingCapital would be <= 0, we fall back to allocatedCapital (safe default).
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all sleeves
const [sleeves] = await conn.execute("SELECT id, allocatedCapital FROM sleeves");

for (const sleeve of sleeves) {
  const sleeveId = sleeve.id;
  const allocatedCapital = parseFloat(sleeve.allocatedCapital);

  // Sum of challenge bumps awarded to this sleeve
  const [bumpRows] = await conn.execute(
    `SELECT COALESCE(SUM(c.allocationBump), 0) AS totalBumps
     FROM challenge_entries ce
     JOIN challenges c ON c.id = ce.challengeId
     WHERE ce.sleeveId = ? AND ce.isWinner = 1`,
    [sleeveId]
  );
  const totalBumps = parseFloat(bumpRows[0].totalBumps || "0");

  // Sum of positive admin cash adjustments (capital injections)
  const [cashRows] = await conn.execute(
    `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS totalAdded
     FROM cash_adjustments
     WHERE sleeveId = ?`,
    [sleeveId]
  );
  const totalAdded = parseFloat(cashRows[0].totalAdded || "0");

  const startingCapital = Math.max(allocatedCapital - totalBumps - totalAdded, 1);

  await conn.execute(
    "UPDATE sleeves SET startingCapital = ? WHERE id = ?",
    [startingCapital.toFixed(2), sleeveId]
  );

  console.log(`Sleeve ${sleeveId}: allocatedCapital=${allocatedCapital}, bumps=${totalBumps}, adminAdded=${totalAdded} → startingCapital=${startingCapital.toFixed(2)}`);
}

console.log("✓ startingCapital backfill complete");
await conn.end();
