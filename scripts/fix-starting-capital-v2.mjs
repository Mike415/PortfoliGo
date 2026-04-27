/**
 * Fix startingCapital using the earliest portfolio snapshot totalValue.
 *
 * The first snapshot captures the sleeve's value right after creation —
 * before any trades. That's the true starting capital regardless of what
 * sleeveSize says now (which may have been edited).
 *
 * Fallback: if no snapshot exists, use the current cashBalance + positionsValue
 * at creation (i.e., allocatedCapital minus any challenge bumps and admin adjustments).
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [sleeves] = await conn.execute(`
  SELECT s.id, s.totalValue, s.allocatedCapital, s.startingCapital, s.cashBalance, s.positionsValue
  FROM sleeves s
`);

for (const sleeve of sleeves) {
  const sleeveId = sleeve.id;

  // Get the earliest snapshot for this sleeve
  const [snapshots] = await conn.execute(
    `SELECT totalValue, snapshotAt FROM portfolio_snapshots
     WHERE sleeveId = ? ORDER BY snapshotAt ASC LIMIT 1`,
    [sleeveId]
  );

  let correctStartingCapital;
  let source;

  if (snapshots.length > 0) {
    correctStartingCapital = parseFloat(snapshots[0].totalValue);
    source = `first snapshot (${snapshots[0].snapshotAt})`;
  } else {
    // No snapshots — use sum of challenge bumps to back-calculate
    const [bumpRows] = await conn.execute(
      `SELECT COALESCE(SUM(c.allocationBump), 0) AS totalBumps
       FROM challenge_entries ce
       JOIN challenges c ON c.id = ce.challengeId
       WHERE ce.sleeveId = ? AND ce.isWinner = 1`,
      [sleeveId]
    );
    const totalBumps = parseFloat(bumpRows[0].totalBumps || "0");

    const [cashRows] = await conn.execute(
      `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS totalAdded
       FROM cash_adjustments WHERE sleeveId = ?`,
      [sleeveId]
    );
    const totalAdded = parseFloat(cashRows[0].totalAdded || "0");

    correctStartingCapital = Math.max(
      parseFloat(sleeve.allocatedCapital) - totalBumps - totalAdded,
      1
    );
    source = `allocatedCapital minus bumps/adjustments`;
  }

  const totalValue = parseFloat(sleeve.totalValue);
  const returnPct = correctStartingCapital !== 0
    ? ((totalValue - correctStartingCapital) / correctStartingCapital) * 100
    : 0;

  await conn.execute(
    "UPDATE sleeves SET startingCapital = ?, returnPct = ? WHERE id = ?",
    [correctStartingCapital.toFixed(2), returnPct.toFixed(4), sleeveId]
  );

  console.log(
    `Sleeve ${sleeveId}: source="${source}", startingCapital=${correctStartingCapital.toFixed(2)}, ` +
    `totalValue=${totalValue.toFixed(2)}, returnPct=${returnPct.toFixed(4)}%`
  );
}

console.log("✓ Fix complete");
await conn.end();
