/**
 * Set startingCapital = 100000 for all sleeves in the Bay Traders and Pizza group.
 * Recalculate returnPct = (totalValue - 100000) / 100000 * 100.
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const STARTING_CAPITAL = 100000;

const [sleeves] = await conn.execute(`SELECT id, totalValue, startingCapital FROM sleeves`);

for (const sleeve of sleeves) {
  const totalValue = parseFloat(sleeve.totalValue);
  const returnPct = ((totalValue - STARTING_CAPITAL) / STARTING_CAPITAL) * 100;

  await conn.execute(
    "UPDATE sleeves SET startingCapital = ?, returnPct = ? WHERE id = ?",
    [STARTING_CAPITAL.toFixed(2), returnPct.toFixed(4), sleeve.id]
  );

  console.log(
    `Sleeve ${sleeve.id}: startingCapital=${STARTING_CAPITAL}, ` +
    `totalValue=${totalValue.toFixed(2)}, returnPct=${returnPct.toFixed(4)}%`
  );
}

console.log("✓ Fix complete");
await conn.end();
