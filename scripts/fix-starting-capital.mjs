/**
 * Fix startingCapital for all sleeves.
 *
 * The correct startingCapital is the group's sleeveSize — the amount each
 * player was given when they joined. This never changes regardless of
 * reallocations or challenge bumps.
 *
 * We also recalculate returnPct using the corrected startingCapital.
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all sleeves joined with their group's sleeveSize
const [sleeves] = await conn.execute(`
  SELECT s.id, s.totalValue, s.allocatedCapital, s.startingCapital, g.sleeveSize
  FROM sleeves s
  JOIN \`groups\` g ON g.id = s.groupId
`);

for (const sleeve of sleeves) {
  const sleeveId = sleeve.id;
  const correctStartingCapital = parseFloat(sleeve.sleeveSize);
  const totalValue = parseFloat(sleeve.totalValue);
  const returnPct = correctStartingCapital !== 0
    ? ((totalValue - correctStartingCapital) / correctStartingCapital) * 100
    : 0;

  await conn.execute(
    "UPDATE sleeves SET startingCapital = ?, returnPct = ? WHERE id = ?",
    [correctStartingCapital.toFixed(2), returnPct.toFixed(4), sleeveId]
  );

  console.log(
    `Sleeve ${sleeveId}: sleeveSize=${correctStartingCapital}, totalValue=${totalValue.toFixed(2)}, ` +
    `old startingCapital=${sleeve.startingCapital}, new returnPct=${returnPct.toFixed(4)}%`
  );
}

console.log("✓ startingCapital and returnPct fix complete");
await conn.end();
