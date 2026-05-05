#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const LOCATION_CONFIG = {
  "old-bridge-ymca": {
    regionName: "Middlesex County",
    regionValue: "164397_414117",
    defaultPdfTo: "Old Bridge YMCA Leadership Team",
    defaultPdfLocation: "Old Bridge YMCA",
  },
  "manasquan-field-house": {
    regionName: "Monmouth County",
    regionValue: "164397_414119",
    defaultPdfTo: "Manasquan Field House Leadership Team",
    defaultPdfLocation: "Manasquan Field House",
  },
};

function parseArgs(argv) {
  const args = {
    headed: false,
    runZvsales: true,
    generatePdf: false,
    baseUrl: "https://seedlive.com",
    homeUrl: "https://seedlive.com/home.i",
    loginUrl: "https://seedlive.com/login.i",
    paramsUrl:
      "https://seedlive.com/activity_ext_parameters.i?exactSortBys=true&sortBy=0%2C%206%2C%202%2C%207&params.endDate=%7B*0%7D&rangeType=DAY&params.tranType=15%2C%2016%2C%2017%2C%2018%2C%2020%2C%2021%2C%2022%2C%2013%2C%2033%2C%2052%2C%2053%2C%2069%2C%2073%2C%2074%2C%2078%2C%2083%2C%2084%2C%2085%2C%2086%2C%2087%2C%2096%2C%2097%2C%2098&dateFormat=MMMM%20dd%2C%20yyyy&params.beginDate=%7B*-518400000%7D&showValues=1",
    downloadDir: "input/json",
    profileDir: ".playwright-profile",
    zvsalesPath: "zvsales.js",
    pdfScriptPath: "scripts/generate-client-report-pdf.js",
    timeoutMs: 30000,
    reportTimeoutMs: 180000,
    stepDelayMs: 500,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--headed") args.headed = true;
    else if (token === "--run-zvsales") args.runZvsales = true;
    else if (token === "--no-run-zvsales") args.runZvsales = false;
    else if (token === "--generate-pdf" || token === "--pdf") args.generatePdf = true;
    else if (token === "--no-generate-pdf" || token === "--no-pdf") args.generatePdf = false;
    else if (token === "--start") args.start = next, (i += 1);
    else if (token === "--end") args.end = next, (i += 1);
    else if (token === "--base-url") args.baseUrl = next, (i += 1);
    else if (token === "--home-url") args.homeUrl = next, (i += 1);
    else if (token === "--login-url") args.loginUrl = next, (i += 1);
    else if (token === "--params-url") args.paramsUrl = next, (i += 1);
    else if (token === "--download-dir") args.downloadDir = next, (i += 1);
    else if (token === "--profile-dir") args.profileDir = next, (i += 1);
    else if (token === "--username") args.username = next, (i += 1);
    else if (token === "--password") args.password = next, (i += 1);
    else if (token === "--zvsales-path") args.zvsalesPath = next, (i += 1);
    else if (token === "--pdf-script-path") args.pdfScriptPath = next, (i += 1);
    else if (token === "--pdf-to") args.pdfTo = next, (i += 1);
    else if (token === "--pdf-location") args.pdfLocation = next, (i += 1);
    else if (token === "--location-key") args.locationKey = next, (i += 1);
    else if (token === "--commission-pct") args.commissionPct = next, (i += 1);
    else if (token === "--pdf-date") args.pdfDate = next, (i += 1);
    else if (token === "--pdf-out") args.pdfOut = next, (i += 1);
    else if (token === "--timeout-ms") args.timeoutMs = Number(next), (i += 1);
    else if (token === "--report-timeout-ms") args.reportTimeoutMs = Number(next), (i += 1);
    else if (token === "--step-delay-ms") args.stepDelayMs = Number(next), (i += 1);
    else throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/monthly-auto.js --start YYYY-MM-DD --end YYYY-MM-DD [options]",
      "",
      "Required:",
      "  --start <YYYY-MM-DD>",
      "  --end <YYYY-MM-DD>",
      "  --commission-pct <number>",
      "",
      "Options:",
      "  --headed                      Run browser in headed mode",
      "  --base-url <url>              SeedLive base URL (default: https://seedlive.com)",
      "  --home-url <url>              Home URL (default: https://seedlive.com/home.i)",
      "  --login-url <url>             Login URL (default: https://seedlive.com/login.i)",
      "  --params-url <url>            Direct report parameter URL",
      "  --download-dir <path>         Download output dir (default: input/json)",
      "  --profile-dir <path>          Playwright user data dir (default: .playwright-profile)",
      "  --username <value>            Optional login username",
      "  --password <value>            Optional login password",
      "  --run-zvsales                 Run zvsales.js after download (default)",
      "  --no-run-zvsales              Skip payout calculation step",
      "  --generate-pdf, --pdf         Generate branded client PDF after export",
      "  --no-generate-pdf             Skip branded client PDF generation (default)",
      "  --zvsales-path <path>         Calculator script path (default: zvsales.js)",
      "  --pdf-script-path <path>      PDF generator script (default: scripts/generate-client-report-pdf.js)",
      "  --location-key <key>          Location key (required: old-bridge-ymca | manasquan-field-house)",
      "  --commission-pct <number>     Commission percent per run (required, e.g. 25 or 20)",
      "  --pdf-to <text>               PDF recipient line",
      "  --pdf-location <text>         PDF location/client line",
      "  --pdf-date <YYYY-MM-DD>       PDF report date",
      "  --pdf-out <path>              PDF output path",
      "  --timeout-ms <number>         Step timeout in ms (default: 30000)",
      "  --report-timeout-ms <number>  Max wait for report result page (default: 180000)",
      "  --step-delay-ms <number>      Delay between major steps (default: 500)",
      "  --help                        Show this help",
      "",
      "Example:",
      "  npm run monthly:auto -- --start 2026-01-05 --end 2026-02-04 --location-key old-bridge-ymca --commission-pct 25 --headed",
      "",
    ].join("\n")
  );
}

function parseISODate(dateStr, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) {
    throw new Error(`${name} must be in YYYY-MM-DD format. Got: ${dateStr}`);
  }
  const d = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${dateStr}`);
  return d;
}

function monthName(date) {
  return date.toLocaleString("en-US", { month: "long" });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeCommissionPct(input) {
  const raw = Number(input);
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(`--commission-pct must be a positive number. Got: ${input}`);
  }
  if (raw > 100) {
    throw new Error(`--commission-pct must be between 0 and 100 (or decimal 0-1). Got: ${input}`);
  }
  return raw <= 1 ? raw : raw / 100;
}

async function locatorExists(locator) {
  try {
    return (await locator.count()) > 0;
  } catch (_) {
    return false;
  }
}

async function clickFirstExisting(candidates, timeoutMs) {
  for (const locator of candidates) {
    if (await locatorExists(locator)) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) {
        await first.click({ timeout: timeoutMs });
        return true;
      }
    }
  }
  return false;
}

function pageLooksLikeLogin(page) {
  return /\/login\.i/i.test(page.url());
}

async function pageLooksAuthenticated(page) {
  const authMarkers = [
    page.locator("#menuContainer"),
    page.locator("#topul"),
    page.locator("#sessionData[data-user-id]"),
    page.locator("a[href*='logout.i']"),
  ];
  for (const marker of authMarkers) {
    if (await locatorExists(marker)) return true;
  }
  return false;
}

async function waitStepDelay(page, ms) {
  if (ms > 0) {
    await page.waitForTimeout(ms);
  }
}

async function maybeLogin(page, opts) {
  if (await pageLooksAuthenticated(page)) return;

  if (!opts.username || !opts.password) {
    return;
  }

  if (!/\/login\.i/i.test(page.url())) {
    await page.goto(opts.loginUrl, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
  }

  const usernameCandidates = [
    page.locator("#username"),
    page.locator("input[name='username']"),
    page.locator("input[name='user']"),
    page.locator("input[type='email']"),
    page.getByLabel(/username|email|user/i),
  ];

  const passwordCandidates = [
    page.locator("#password"),
    page.locator("input[name='password']"),
    page.locator("input[type='password']"),
    page.getByLabel(/password|pass/i),
  ];

  const usernameSet = await fillFirstExisting(usernameCandidates, opts.username);
  const passwordSet = await fillFirstExisting(passwordCandidates, opts.password);

  if (usernameSet && passwordSet) {
    const clicked = await clickFirstExisting(
      [
        page.getByRole("button", { name: /log in|login|sign in/i }),
        page.locator("input[type='submit'][value*='Log' i]"),
        page.locator("input[type='submit'][value*='Sign' i]"),
      ],
      opts.timeoutMs
    );
    if (!clicked) {
      throw new Error("Could not find login submit button.");
    }

    await page.waitForLoadState("domcontentloaded", { timeout: opts.timeoutMs }).catch(() => {});
    await waitStepDelay(page, opts.stepDelayMs);

    if (await pageLooksAuthenticated(page)) return;

    if (pageLooksLikeLogin(page)) {
      throw new Error("Still on login page after submit. Check credentials or increase --step-delay-ms.");
    }
  }
}

async function fillFirstExisting(candidates, value) {
  for (const locator of candidates) {
    if (await locatorExists(locator)) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) {
        await first.fill(value);
        return true;
      }
    }
  }
  return false;
}

async function selectByLabelText(page, label, value, timeoutMs) {
  const select = page.locator(`xpath=//*[contains(normalize-space(.), "${label}:")][1]/following::select[1]`).first();
  await select.waitFor({ state: "visible", timeout: timeoutMs });
  await select.selectOption({ label: value });
}

async function selectDateTriplet(page, label, date, timeoutMs) {
  const isBeginning = label.toLowerCase().startsWith("begin");
  const monthSel = page.locator(isBeginning ? "#beginMonth" : "#endMonth");
  const daySel = page.locator(isBeginning ? "#beginDay" : "#endDay");
  const yearSel = page.locator(isBeginning ? "#beginYear" : "#endYear");

  await monthSel.waitFor({ state: "visible", timeout: timeoutMs });
  await monthSel.selectOption({ label: monthName(date) });

  const dayPadded = pad2(date.getDate());
  try {
    await daySel.selectOption({ label: dayPadded });
  } catch (_) {
    await daySel.selectOption({ label: String(date.getDate()) });
  }

  await yearSel.selectOption({ label: String(date.getFullYear()) });
}

async function setCheckboxByText(page, text, checked, timeoutMs) {
  const checkbox = page
    .locator(`xpath=//*[contains(normalize-space(.), "${text}")]/preceding::input[@type='checkbox'][1]`)
    .first();

  await checkbox.waitFor({ state: "visible", timeout: timeoutMs });
  const current = await checkbox.isChecked();
  if (checked && !current) await checkbox.check();
  if (!checked && current) await checkbox.uncheck();
}

async function navigateToConfigure(page, timeoutMs) {
  const clickedReports = await clickFirstExisting(
    [
      page.getByRole("link", { name: /reports/i }),
      page.locator("a:has-text('reports')"),
    ],
    timeoutMs
  );
  if (!clickedReports) throw new Error('Unable to click "Reports" menu.');

  const clickedSaved = await clickFirstExisting(
    [
      page.getByRole("link", { name: /saved reports/i }),
      page.locator("a:has-text('saved reports')"),
    ],
    timeoutMs
  );
  if (!clickedSaved) throw new Error('Unable to click "Saved Reports" submenu.');

  await clickFirstExisting(
    [
      page.getByRole("link", { name: /daily operations/i }),
      page.locator("a:has-text('Daily Operations')"),
    ],
    timeoutMs
  );

  const row = page.locator("tr", { hasText: /Day By Day Detail/i }).first();
  await row.waitFor({ state: "visible", timeout: timeoutMs });

  const clickedConfigure = await clickFirstExisting(
    [
      row.getByRole("link", { name: /configure/i }),
      row.locator("a[title*='Configure' i]"),
      row.locator("a:has(img[alt*='Configure' i])"),
      row.locator("a").first(),
    ],
    timeoutMs
  );
  if (!clickedConfigure) throw new Error('Unable to click "Configure" for Day By Day Detail.');
}

async function navigateDirectToParameters(page, opts) {
  const target = opts.paramsUrl || `${opts.baseUrl.replace(/\/$/, "")}/activity_ext_parameters.i`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
  if (pageLooksLikeLogin(page)) {
    await maybeLogin(page, opts);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
  }
  await page.locator("#criteriaForm").waitFor({ state: "visible", timeout: opts.timeoutMs });
}

async function setSelectInContainer(page, containerId, label, timeoutMs) {
  const select = page.locator(`#${containerId} select`).first();
  await select.waitFor({ state: "visible", timeout: timeoutMs });
  await select.selectOption({ label });
}

async function configureReport(page, startDate, endDate, timeoutMs) {
  await selectDateTriplet(page, "Beginning", startDate, timeoutMs);
  await selectDateTriplet(page, "Ending", endDate, timeoutMs);

  await setSelectInContainer(page, "split", "-- None --", timeoutMs); // Header
  await setSelectInContainer(page, "section", "-- None --", timeoutMs); // Section
  await setSelectInContainer(page, "groupby", "Day", timeoutMs); // Row
  await setSelectInContainer(page, "tabby", "Transaction Type", timeoutMs); // Column

  // Preserve default transaction categories as "all on".
  const txTopLevelIds = ["#tranTypeAll", "#tranCategoryCheckbox1", "#tranCategoryCheckbox2", "#tranCategoryCheckbox3"];
  for (const selector of txTopLevelIds) {
    const el = page.locator(selector).first();
    if (await locatorExists(el)) {
      await el.waitFor({ state: "visible", timeout: timeoutMs });
      if (!(await el.isChecked())) await el.check();
    }
  }

  // Data values exact selection.
  await page.locator("#checkbox_1").check({ timeout: timeoutMs }); // Sale Amount
  await page.locator("#checkbox_3").check({ timeout: timeoutMs }); // # of Items

  // Ensure the other Data Values checkboxes are off.
  const offSelectors = [
    "#showPercents_1",
    "#checkbox_2",
    "#showPercents_2",
    "#showPercents_3",
    "input[name='showAverages'][value='1']",
    "input[name='showAverages'][value='2']",
  ];
  for (const selector of offSelectors) {
    const el = page.locator(selector).first();
    if (await locatorExists(el)) {
      await el.waitFor({ state: "attached", timeout: timeoutMs });
      if (await el.isEnabled().catch(() => true)) {
        if (await el.isChecked().catch(() => false)) await el.uncheck();
      }
    }
  }

  // Keep Format = Html (default).
  const htmlRadio = page.locator("input[name='outputType'][value='22']").first();
  if (await locatorExists(htmlRadio)) {
    await htmlRadio.waitFor({ state: "visible", timeout: timeoutMs });
    if (!(await htmlRadio.isChecked())) await htmlRadio.check();
  }
}

async function ensureCustomerExpanded(page, timeoutMs) {
  const regionCheckboxes = page.locator("input[name='customerId_regionId']");
  if ((await regionCheckboxes.count().catch(() => 0)) > 0) return;

  const companyTreeImage = page.locator("a.rpt-child-treeImage[data-customer-id]").first();
  const customerRegionContainer = page.locator("div[id^='regions_of_']").first();

  await companyTreeImage.waitFor({ state: "visible", timeout: timeoutMs });

  // Expand using only the plus/tree icon so we never toggle customer checkboxes.
  try {
    await companyTreeImage.click({ timeout: 2000 });
  } catch (_) {
    try {
      await companyTreeImage.click({ timeout: 2000, force: true });
    } catch (_) {
      await companyTreeImage.evaluate((el) => el.click());
    }
  }

  const expansionWaitMs = Math.min(timeoutMs, 8000);
  const waitStart = Date.now();
  while (Date.now() - waitStart < expansionWaitMs) {
    if ((await regionCheckboxes.count().catch(() => 0)) > 0) return;

    if (await locatorExists(customerRegionContainer)) {
      const html = await customerRegionContainer.first().innerHTML().catch(() => "");
      if (/class="regions tree"/.test(html)) {
        await page.waitForTimeout(100);
        if ((await regionCheckboxes.count().catch(() => 0)) > 0) return;
      }
    }
    await page.waitForTimeout(100);
  }

  throw new Error("Unable to expand customer tree to load region checkboxes.");
}

async function applyRegionSelection(page, locationConfig, timeoutMs) {
  await ensureCustomerExpanded(page, timeoutMs);

  const regionCheckboxes = page.locator("input[name='customerId_regionId']");
  const count = await regionCheckboxes.count();
  if (count === 0) {
    throw new Error("Region checkboxes are not available on the report form.");
  }

  for (let i = 0; i < count; i += 1) {
    const checkbox = regionCheckboxes.nth(i);
    await checkbox.waitFor({ state: "visible", timeout: timeoutMs });
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }

  const target = page.locator(`input[name='customerId_regionId'][value='${locationConfig.regionValue}']`).first();
  if (!(await locatorExists(target))) {
    throw new Error(
      `Could not find region checkbox for "${locationConfig.regionName}" (${locationConfig.regionValue}).`
    );
  }
  await target.waitFor({ state: "visible", timeout: timeoutMs });
  if (!(await target.isChecked())) await target.check();
}

async function clickRunReport(page, timeoutMs) {
  const clicked = await clickFirstExisting([page.locator("#Submit"), page.locator("input[type='submit'][value*='Run Report' i]")], timeoutMs);

  if (!clicked) throw new Error('Unable to click "Run Report".');
}

async function waitForResultsPage(page, timeoutMs) {
  await page.locator("#report-button-json").first().waitFor({ state: "visible", timeout: timeoutMs });
}

async function clickJsonExport(page, timeoutMs) {
  const clicked = await clickFirstExisting(
    [
      page.locator("#report-button-json"),
      page.locator("button[title='View in JSON Values']"),
      page.locator("[title='View in JSON Values']"),
    ],
    timeoutMs
  );
  if (!clicked) throw new Error("Unable to click JSON export icon.");
}

function validateExportJson(downloadedPath) {
  const raw = fs.readFileSync(downloadedPath, "utf8");
  const rows = JSON.parse(raw);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Downloaded JSON is empty or not an array.");
  }

  const sample = rows[0] || {};
  const required = ["Day", "Trans Type", "Amount"];
  for (const key of required) {
    if (!(key in sample)) {
      throw new Error(`Downloaded JSON missing key "${key}" in first row.`);
    }
  }

  return rows.length;
}

function runZvsales(zvsalesPath, inputPath, revShare) {
  const resolved = path.resolve(zvsalesPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`zvsales script not found: ${resolved}`);
  }
  return execFileSync(process.execPath, [resolved, inputPath], {
    encoding: "utf8",
    env: { ...process.env, REV_SHARE: String(revShare) },
  });
}

function runPdfReport(args, inputPath) {
  const resolved = path.resolve(args.pdfScriptPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`PDF generator script not found: ${resolved}`);
  }

  const cmdArgs = [resolved, "--input", inputPath];
  if (args.pdfTo) cmdArgs.push("--to", args.pdfTo);
  if (args.pdfLocation) cmdArgs.push("--location", args.pdfLocation);
  if (args.pdfDate) cmdArgs.push("--date", args.pdfDate);
  if (args.pdfOut) cmdArgs.push("--out", args.pdfOut);
  if (Number.isFinite(args.revShare)) cmdArgs.push("--rev-share", String(args.revShare));

  return execFileSync(process.execPath, cmdArgs, { encoding: "utf8" });
}

function logStep(msg) {
  process.stdout.write(`\n[step] ${msg}\n`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.start || !args.end) {
    throw new Error("Both --start and --end are required. Use --help for usage.");
  }
  if (args.commissionPct == null) {
    throw new Error("Missing required --commission-pct. Example: --commission-pct 25");
  }
  if (!args.locationKey) {
    throw new Error("Missing required --location-key. Valid values: old-bridge-ymca, manasquan-field-house.");
  }
  const locationConfig = LOCATION_CONFIG[args.locationKey];
  if (!locationConfig) {
    throw new Error(
      `Invalid --location-key "${args.locationKey}". Valid values: ${Object.keys(LOCATION_CONFIG).join(", ")}.`
    );
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive number. Got: ${args.timeoutMs}`);
  }
  if (!Number.isFinite(args.reportTimeoutMs) || args.reportTimeoutMs <= 0) {
    throw new Error(`--report-timeout-ms must be a positive number. Got: ${args.reportTimeoutMs}`);
  }
  if (!Number.isFinite(args.stepDelayMs) || args.stepDelayMs < 0) {
    throw new Error(`--step-delay-ms must be 0 or higher. Got: ${args.stepDelayMs}`);
  }
  const revShare = normalizeCommissionPct(args.commissionPct);

  const startDate = parseISODate(args.start, "start");
  const endDate = parseISODate(args.end, "end");
  if (startDate > endDate) {
    throw new Error("--start must be on or before --end.");
  }

  const downloadDir = path.resolve(args.downloadDir);
  const profileDir = path.resolve(args.profileDir);
  ensureDir(downloadDir);
  ensureDir(profileDir);

  logStep("Launching browser");
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !args.headed,
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(args.timeoutMs);

    logStep(`Opening ${args.homeUrl}`);
    await page.goto(args.homeUrl, { waitUntil: "domcontentloaded", timeout: args.timeoutMs });
    await waitStepDelay(page, args.stepDelayMs);

    logStep("Attempting login (if needed)");
    await maybeLogin(page, args);
    await waitStepDelay(page, args.stepDelayMs);

    logStep("Navigating directly to report parameters");
    await navigateDirectToParameters(page, args);
    await waitStepDelay(page, args.stepDelayMs);

    logStep(`Applying report settings for ${args.start} -> ${args.end}`);
    await configureReport(page, startDate, endDate, args.timeoutMs);
    await applyRegionSelection(page, locationConfig, args.timeoutMs);
    await waitStepDelay(page, args.stepDelayMs);

    logStep("Running report");
    await clickRunReport(page, args.timeoutMs);
    await waitForResultsPage(page, args.reportTimeoutMs);
    await waitStepDelay(page, args.stepDelayMs);

    logStep("Exporting JSON");
    const downloadPromise = page.waitForEvent("download", { timeout: args.timeoutMs });
    await clickJsonExport(page, args.timeoutMs);
    const download = await downloadPromise;

    const suggestedName = download.suggestedFilename();
    const outputPath = path.join(downloadDir, suggestedName);
    await download.saveAs(outputPath);

    logStep(`Downloaded: ${outputPath}`);
    const rowCount = validateExportJson(outputPath);
    process.stdout.write(`[info] JSON rows: ${rowCount}\n`);

    if (args.runZvsales) {
      logStep("Running payout calculator");
      const result = runZvsales(args.zvsalesPath, outputPath, revShare);
      process.stdout.write(`${result}\n`);
    } else {
      process.stdout.write("[info] Skipped zvsales execution (--no-run-zvsales).\n");
    }

    if (args.generatePdf) {
      logStep("Generating branded client PDF");
      const pdfArgs = {
        ...args,
        revShare,
        pdfTo: args.pdfTo || locationConfig.defaultPdfTo,
        pdfLocation: args.pdfLocation || locationConfig.defaultPdfLocation,
      };
      const pdfResult = runPdfReport(pdfArgs, outputPath);
      process.stdout.write(`${pdfResult}\n`);
    } else {
      process.stdout.write("[info] Skipped PDF generation (--no-generate-pdf).\n");
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message || err}\n`);
  process.exit(1);
});

