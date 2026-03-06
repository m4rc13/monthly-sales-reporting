#!/usr/bin/env node
/**
 * Usage:
 *   node zenvend_billing_email.js /path/to/activity.json --cog 50
 *
 * Optional overrides (env):
 *   PROC_FIXED=9.95 PROC_RATE=0.0595 REV_SHARE=0.25 COG_RATE=50
 *
 * Notes:
 * - Cash = rows where `Trans Type` === "Cash"
 * - Non-cash = everything else (Credit, Apple Pay, Google Pay, etc.)
 */

const {
  money,
  loadRowsFromFile,
  calculateFromRows,
} = require("./lib/sales-calc");

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("Usage: node zenvend_billing_email.js /path/to/activity.json --cog 50");
    process.exit(1);
  }

  const rows = loadRowsFromFile(jsonPath);

  // Inputs
  const calc = calculateFromRows(rows, {
    cogRate: getArg("--cog") ?? process.env.COG_RATE ?? 50,
    procFixed: process.env.PROC_FIXED ?? 9.95,
    procRate: process.env.PROC_RATE ?? 0.0595,
    revShare: process.env.REV_SHARE ?? 0.25,
  });

  const out = [
    `Sales period: ${calc.period.startISO} to ${calc.period.endISO}`,
    ``,
    `Total gross sales = ${money(calc.totals.cash)} (cash) + ${money(calc.totals.nonCash)} (non-cash) = ${money(calc.totals.total)}`,
    `COG @ ${(calc.rates.cogRate * 100).toFixed(0)}% = ${money(calc.totals.cog)}`,
    `Merchant Processing Fees = ${money(calc.rates.procFixed)} + (${(calc.rates.procRate * 100).toFixed(2)}% * ${money(calc.totals.nonCash)}) = ${money(calc.totals.merchantFees)}`,
    ``,
    `${money(calc.totals.total)} - ${money(calc.totals.cog)} - ${money(calc.totals.merchantFees)} = ${money(calc.totals.net)}`,
    `${money(calc.totals.net)} * ${(calc.rates.revShare * 100).toFixed(0)}% = ${money(calc.totals.payout)}`,
  ].join("\n");

  process.stdout.write(out + "\n");
}

try {
  main();
} catch (e) {
  console.error("ERROR:", e?.message || e);
  process.exit(2);
}

