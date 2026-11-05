#!/usr/bin/env node
/**
 * Unattended monthly run, meant to be triggered by launchd (see launchd/).
 *
 * - Works out the reporting period from today's date and the location's anchor day.
 * - Reads SeedLive + Gmail SMTP credentials from the macOS Keychain.
 * - Runs monthly-auto.js headless with --generate-pdf.
 * - Emails the PDF to the recipients; on failure, emails a log tail to the alert address.
 *
 * Keychain items (create once):
 *   security add-generic-password -U -s zenvend-seedlive   -a marc@zenvend.co -w
 *   security add-generic-password -U -s zenvend-gmail-smtp -a marc@zenvend.co -w
 */

const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const nodemailer = require("nodemailer");

const ROOT = path.resolve(__dirname, "..");

const SCHEDULES = {
  "old-bridge-ymca": { anchorDay: 5, commissionPct: 25, folder: "OB", label: "Old Bridge YMCA" },
  "manasquan-field-house": { anchorDay: 14, commissionPct: 20, folder: "Squan", label: "Manasquan Field House" },
};

const SEEDLIVE_USER = "marc@zenvend.co";
const MAIL_FROM = "marc@zenvend.co";
const RECIPIENTS = ["marc@zenvend.co", "emma@zenvend.co"];
const ALERT_TO = ["marc@zenvend.co"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseArgs(argv) {
  const args = { email: true, dryRun: false, force: false };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    const next = argv[i + 1];
    if (t === "--location-key") args.locationKey = next, (i += 1);
    else if (t === "--today") args.today = next, (i += 1);
    else if (t === "--to") args.to = next.split(",").map((s) => s.trim()).filter(Boolean), (i += 1);
    else if (t === "--no-email") args.email = false;
    else if (t === "--dry-run") args.dryRun = true;
    else if (t === "--force") args.force = true;
    else if (t === "--headed") args.headed = true;
    else throw new Error(`Unknown argument: ${t}`);
  }
  return args;
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-based

/** Period = previous month's anchor day through this month's (anchor - 1). */
function computePeriod(today, anchorDay) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const start = new Date(y, m - 1, anchorDay);
  const end = new Date(y, m, anchorDay - 1);
  return {
    start: iso(start.getFullYear(), start.getMonth(), start.getDate()),
    end: iso(end.getFullYear(), end.getMonth(), end.getDate()),
    monthLabel: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
    fileMonth: `${MONTHS[start.getMonth()]}_${start.getFullYear()}`,
  };
}

function keychain(service, account) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_) {
    throw new Error(`Keychain item not found: service="${service}" account="${account}"`);
  }
}

function makeTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: MAIL_FROM, pass: keychain("zenvend-gmail-smtp", MAIL_FROM).replace(/\s+/g, "") },
  });
}

function runChild(cmdArgs, env, logStream) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(process.execPath, cmdArgs, { cwd: ROOT, env });
    const onData = (buf) => {
      const s = buf.toString();
      output += s;
      logStream.write(s);
      process.stdout.write(s);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const schedule = SCHEDULES[args.locationKey];
  if (!schedule) {
    throw new Error(`--location-key must be one of: ${Object.keys(SCHEDULES).join(", ")}`);
  }

  const today = args.today ? new Date(`${args.today}T12:00:00`) : new Date();
  const period = computePeriod(today, schedule.anchorDay);
  const pdfOut = path.join(ROOT, "reporting", schedule.folder, `ZenVend_${period.fileMonth}_Sales_Report.pdf`);
  const recipients = args.to || RECIPIENTS;

  const logDir = path.join(ROOT, "logs");
  const stateDir = path.join(logDir, "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDir, `${args.locationKey}_${stamp}.log`);
  const sentMarker = path.join(stateDir, `${args.locationKey}_${period.start}.sent`);

  const summary =
    `${schedule.label}: ${period.start} -> ${period.end} @ ${schedule.commissionPct}%\n` +
    `PDF: ${pdfOut}\nEmail: ${args.email ? recipients.join(", ") : "(disabled)"}\n`;
  process.stdout.write(summary);
  if (args.dryRun) return;

  if (fs.existsSync(sentMarker) && !args.force) {
    process.stdout.write(`Already sent for this period (${sentMarker}). Use --force to resend.\n`);
    return;
  }

  const logStream = fs.createWriteStream(logPath);
  logStream.write(`${new Date().toISOString()}\n${summary}\n`);

  let result;
  try {
    const env = {
      ...process.env,
      SEEDLIVE_USERNAME: SEEDLIVE_USER,
      SEEDLIVE_PASSWORD: keychain("zenvend-seedlive", SEEDLIVE_USER),
    };
    const cmdArgs = [
      path.join(ROOT, "scripts", "monthly-auto.js"),
      "--start", period.start,
      "--end", period.end,
      "--location-key", args.locationKey,
      "--commission-pct", String(schedule.commissionPct),
      "--generate-pdf",
      "--pdf-out", pdfOut,
    ];
    if (args.headed) cmdArgs.push("--headed");
    result = await runChild(cmdArgs, env, logStream);
  } catch (err) {
    result = { code: 1, output: `ERROR: ${err.message}\n` };
    logStream.write(result.output);
  }

  const payout = (result.output.match(/Payout amount:\s*(\S+)/) || [])[1];
  const ok = result.code === 0 && fs.existsSync(pdfOut);

  if (!args.email) {
    logStream.end();
    if (!ok) throw new Error(`Run failed (exit ${result.code}). Log: ${logPath}`);
    return;
  }

  const transport = makeTransport();
  if (ok) {
    await transport.sendMail({
      from: `ZenVend Reports <${MAIL_FROM}>`,
      to: recipients,
      subject: `ZenVend ${schedule.label} sales report - ${period.monthLabel}${payout ? ` (${payout})` : ""}`,
      text:
        `Attached is the ${schedule.label} sales report for ${period.start} through ${period.end}.\n\n` +
        `Commission: ${schedule.commissionPct}%\n` +
        (payout ? `Payout amount: ${payout}\n` : "") +
        `\n(Sent automatically by monthly-sales-reporting.)\n`,
      attachments: [{ filename: path.basename(pdfOut), path: pdfOut }],
    });
    fs.writeFileSync(sentMarker, `${new Date().toISOString()}\n${recipients.join(", ")}\n`);
    logStream.write(`\nEmailed ${path.basename(pdfOut)} to ${recipients.join(", ")}\n`);
    process.stdout.write(`Emailed to ${recipients.join(", ")}\n`);
  } else {
    const tail = result.output.split("\n").slice(-60).join("\n");
    await transport.sendMail({
      from: `ZenVend Reports <${MAIL_FROM}>`,
      to: ALERT_TO,
      subject: `FAILED: ZenVend ${schedule.label} sales report - ${period.monthLabel}`,
      text:
        `The scheduled run failed (exit ${result.code}).\n\nPeriod: ${period.start} -> ${period.end}\n` +
        `Full log: ${logPath}\n\nRerun manually:\n  cd ${ROOT} && node scripts/scheduled-run.js --location-key ${args.locationKey} --headed\n\n` +
        `--- last lines ---\n${tail}\n`,
    });
    logStream.write(`\nFailure alert emailed to ${ALERT_TO.join(", ")}\n`);
  }
  logStream.end();
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message || err}\n`);
  process.exit(1);
});
