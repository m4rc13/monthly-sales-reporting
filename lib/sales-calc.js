const fs = require("fs");

function parseMoney(s) {
  const n = Number(String(s).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Bad Amount: ${s}`);
  return n;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function parseMMDDYYYY(s) {
  const [mm, dd, yyyy] = String(s).split("/").map((x) => Number(x));
  return new Date(yyyy, mm - 1, dd);
}

function fmtISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseCogRate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`COG rate must be a positive number. Got: ${raw}`);
  }
  // Accept either 0-1 fraction (0.50) or whole percent (50).
  if (n > 1 && n <= 100) return n / 100;
  if (n > 0 && n < 1) return n;
  throw new Error(`COG rate must be between 0 and 1, or 1 to 100 as percent. Got: ${raw}`);
}

function loadRowsFromFile(jsonPath) {
  const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Expected a non-empty JSON array of rows.");
  }
  return rows;
}

function calculateFromRows(rows, options = {}) {
  const cogRate = parseCogRate(options.cogRate ?? 50);
  const procFixed = Number(options.procFixed ?? 9.95);
  const procRate = Number(options.procRate ?? 0.0595);
  const revShare = Number(options.revShare ?? 0.25);

  const dates = rows.map((r) => parseMMDDYYYY(r["Day"]));
  const start = new Date(Math.min(...dates));
  const end = new Date(Math.max(...dates));

  let cash = 0;
  let nonCash = 0;

  for (const r of rows) {
    const amt = parseMoney(r["Amount"]);
    const transType = String(r["Trans Type"] ?? "");
    if (transType === "Cash") cash += amt;
    else nonCash += amt;
  }

  cash = round2(cash);
  nonCash = round2(nonCash);

  const total = round2(cash + nonCash);
  const cog = round2(total * cogRate);
  const merchantFees = round2(procFixed + procRate * nonCash);
  const net = round2(total - cog - merchantFees);
  const payout = round2(net * revShare);

  return {
    period: {
      startDate: start,
      endDate: end,
      startISO: fmtISO(start),
      endISO: fmtISO(end),
    },
    rates: { cogRate, procFixed, procRate, revShare },
    totals: { cash, nonCash, total, cog, merchantFees, net, payout },
  };
}

module.exports = {
  money,
  round2,
  fmtISO,
  parseCogRate,
  loadRowsFromFile,
  calculateFromRows,
};

