#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { loadRowsFromFile, calculateFromRows, money } = require("../lib/sales-calc");

function parseArgs(argv) {
  const args = {
    to: "Old Bridge YMCA Leadership Team",
    from: "ZenVend",
    subject: "Vending Machine Sales Analytics Report",
    logo: "images/master-brand.png",
    outDir: "reporting",
    date: new Date().toISOString().slice(0, 10),
    cogRate: process.env.COG_RATE ?? 50,
    procFixed: process.env.PROC_FIXED ?? 9.95,
    procRate: process.env.PROC_RATE ?? 0.0595,
    revShare: process.env.REV_SHARE ?? 0.25,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--input") args.input = next, (i += 1);
    else if (token === "--to") args.to = next, (i += 1);
    else if (token === "--location") args.location = next, (i += 1);
    else if (token === "--from") args.from = next, (i += 1);
    else if (token === "--subject") args.subject = next, (i += 1);
    else if (token === "--date") args.date = next, (i += 1);
    else if (token === "--logo") args.logo = next, (i += 1);
    else if (token === "--out") args.out = next, (i += 1);
    else if (token === "--out-dir") args.outDir = next, (i += 1);
    else if (token === "--cog") args.cogRate = next, (i += 1);
    else if (token === "--proc-fixed") args.procFixed = next, (i += 1);
    else if (token === "--proc-rate") args.procRate = next, (i += 1);
    else if (token === "--rev-share") args.revShare = next, (i += 1);
    else throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/generate-client-report-pdf.js --input <path> [options]",
      "",
      "Required:",
      "  --input <path>               Activity Analysis JSON",
      "",
      "Optional:",
      '  --to <recipient>             Recipient line (default: "Old Bridge YMCA Leadership Team")',
      "  --location <name>            Location/client description line",
      "  --from <name>                Sender (default: ZenVend)",
      "  --subject <text>             Subject line",
      "  --date <YYYY-MM-DD>          Report date (default: today)",
      "  --logo <path>                Logo image path (default: images/master-brand.png)",
      "  --out <path>                 Exact PDF output path",
      "  --out-dir <path>             Output directory if --out omitted (default: reporting)",
      "  --cog <value>                COG percent or fraction (default: 50)",
      "  --proc-fixed <value>         Merchant fixed fee",
      "  --proc-rate <value>          Merchant percentage fee",
      "  --rev-share <value>          Profit share percent or fraction",
      "",
      "Example:",
      '  node scripts/generate-client-report-pdf.js --input "input/json/Activity Analysis - All from January 05 2026 to February 04 2026.json" --location "Old Bridge YMCA"',
      "",
    ].join("\n")
  );
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileName(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
}

function monthName(d) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function displayDate(isoStr) {
  const d = new Date(`${isoStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function moneyNegativeStyle(n) {
  if (n < 0) return `(${money(Math.abs(n))})`;
  return n === 0 ? "$0.00" : money(n);
}

function normalizeRecipientText(s) {
  return String(s)
    .split(/\s*;\s*/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n");
}

function drawRow(doc, y, label, value, options = {}) {
  const leftX = 58;
  const rightX = 350;
  const width = 190;
  const weight = options.bold ? "Helvetica-Bold" : "Helvetica";
  doc.font(weight).fontSize(11).fillColor("#123D34").text(label, leftX, y);
  doc.font(weight).fontSize(11).fillColor("#123D34").text(value, rightX, y, { width, align: "right" });
}

async function generatePdf(args) {
  if (!args.input) throw new Error("--input is required.");

  const rows = loadRowsFromFile(path.resolve(args.input));
  const calc = calculateFromRows(rows, {
    cogRate: args.cogRate,
    procFixed: args.procFixed,
    procRate: args.procRate,
    revShare: args.revShare,
  });

  const periodLabel = `${monthName(calc.period.startDate)} Sales Report`;
  const defaultName = `ZenVend_${sanitizeFileName(periodLabel)}.pdf`;
  const outPath = path.resolve(args.out || path.join(args.outDir, defaultName));
  ensureDir(path.dirname(outPath));

  const doc = new PDFDocument({ size: "LETTER", margins: { top: 46, bottom: 46, left: 48, right: 48 } });
  const outStream = fs.createWriteStream(outPath);
  doc.pipe(outStream);

  const logoPath = path.resolve(args.logo);
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 438, 36, { fit: [130, 130], align: "right", valign: "top" });
  }

  doc.font("Helvetica-Bold").fontSize(21).fillColor("#123D34").text(periodLabel, 48, 50);
  doc.font("Helvetica").fontSize(10.5).fillColor("#123D34").text(`Sales period: ${calc.period.startISO} to ${calc.period.endISO}`, 48, 78);

  const toText = normalizeRecipientText(args.to);
  let y = 128;
  doc.font("Helvetica-Bold").fontSize(11).text("To:", 48, y);
  const toWidth = 330;
  const toHeight = doc.heightOfString(toText, { width: toWidth });
  doc.font("Helvetica").fontSize(11).text(toText, 90, y, { width: toWidth });
  y += Math.max(18, toHeight + 6);
  doc.font("Helvetica-Bold").fontSize(11).text("From:", 48, y);
  doc.font("Helvetica").fontSize(11).text(args.from, 90, y);
  y += 18;
  doc.font("Helvetica-Bold").fontSize(11).text("Date:", 48, y);
  doc.font("Helvetica").fontSize(11).text(displayDate(args.date), 90, y);
  y += 18;
  doc.font("Helvetica-Bold").fontSize(11).text("Subject:", 48, y);
  const subjectWidth = 320;
  const subjectHeight = doc.heightOfString(args.subject, { width: subjectWidth });
  doc.font("Helvetica").fontSize(11).text(args.subject, 100, y, { width: subjectWidth });

  y += Math.max(24, subjectHeight + 12);
  doc.font("Helvetica").fontSize(10.5).fillColor("#123D34");
  const intro = args.location
    ? `This report summarizes monthly sales and profit-share calculations for the ZenVend vending service at ${args.location}.`
    : "This report summarizes monthly sales and profit-share calculations for the ZenVend vending service.";
  const introWidth = 490;
  const introHeight = doc.heightOfString(intro, { width: introWidth });
  doc.text(intro, 48, y, { width: introWidth });

  y += introHeight + 14;
  doc.font("Helvetica-Bold").fontSize(13).text("Sales Summary", 48, y);
  y += 24;
  drawRow(doc, y, "Cash Sales", money(calc.totals.cash));
  y += 18;
  drawRow(doc, y, "Non-Cash Sales", money(calc.totals.nonCash));
  y += 18;
  drawRow(doc, y, "Total Gross Sales", money(calc.totals.total), { bold: true });

  y += 30;
  doc.font("Helvetica-Bold").fontSize(13).text("Financial Breakdown", 48, y);
  y += 24;
  drawRow(doc, y, "Total Gross Sales", money(calc.totals.total));
  y += 18;
  drawRow(doc, y, `Cost of Goods (${(calc.rates.cogRate * 100).toFixed(0)}%)`, moneyNegativeStyle(-calc.totals.cog));
  y += 18;
  drawRow(doc, y, "Merchant Processing Fees", moneyNegativeStyle(-calc.totals.merchantFees));
  y += 18;
  drawRow(doc, y, "Net Profit", money(calc.totals.net), { bold: true });

  y += 30;
  doc.roundedRect(48, y, 500, 66, 10).fillAndStroke("#F1E2D4", "#D0B9A1");
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#123D34").text("Client Profit Share", 62, y + 12);
  doc.font("Helvetica").fontSize(11).text(`${(calc.rates.revShare * 100).toFixed(0)}% of Net Profit`, 62, y + 34);
  doc.font("Helvetica-Bold").fontSize(22).text(money(calc.totals.payout), 380, y + 20, { width: 150, align: "right" });

  y += 92;
  doc.font("Helvetica").fontSize(10.5).fillColor("#123D34").text(
    "Please let us know if you have any questions. We appreciate your continued partnership.",
    48,
    y,
    { width: 500 }
  );
  y += 38;
  doc.font("Helvetica").fontSize(11).text("Sincerely,", 48, y);
  y += 20;
  doc.font("Helvetica-Bold").fontSize(11).text("The ZenVend Team", 48, y);

  doc.end();

  await new Promise((resolve, reject) => {
    outStream.on("finish", resolve);
    outStream.on("error", reject);
  });

  return { outPath, calc };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const result = await generatePdf(args);
  process.stdout.write(`Generated PDF: ${result.outPath}\n`);
  process.stdout.write(`Payout amount: ${money(result.calc.totals.payout)}\n`);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message || err}\n`);
  process.exit(1);
});

