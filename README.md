# Monthly Sales Reporting

Small Node.js project for monthly vending sales payout calculations.

It uses:
- `zvsales.js` to compute payout from a SeedLive JSON export.
- `scripts/monthly-auto.js` to automate SeedLive report generation/download with Playwright.

## Next Month Quick Run

From project root, run this one command (update dates + credentials):

```bash
npm run monthly:auto -- --start 2026-04-05 --end 2026-05-04 --location-key old-bridge-ymca --commission-pct 25 --headed --username "YOUR_USERNAME" --password 'YOUR_PASSWORD' --generate-pdf
```

What this does in one run:
- Logs into SeedLive
- Generates and downloads the JSON activity report
- Calculates sales/payout output
- Generates the branded one-page PDF in `reporting/`

## What This Calculates

Given a SeedLive "Activity Analysis - All" JSON export, the calculator prints:
- Sales period (min/max `Day` values found in JSON)
- Gross sales split into cash vs non-cash
- COG amount
- Merchant processing fees
- Net and payout share

Formula summary:
- `total = cash + nonCash`
- `cog = total * COG_RATE`
- `merchantFees = PROC_FIXED + (PROC_RATE * nonCash)`
- `net = total - cog - merchantFees`
- `payout = net * REV_SHARE`

## Prerequisites

- Node.js 18+ recommended
- SeedLive account access

Install dependencies:

```bash
npm install
npx playwright install chromium
```

## Input File Format

Expected input is a non-empty JSON array of rows containing at least:
- `Day` (format `MM/DD/YYYY`)
- `Trans Type`
- `Amount` (currency string like `$12.34`)

Typical filename from SeedLive:

`Activity Analysis - All from January 05 2026 to February 04 2026.json`

## Manual Workflow (SeedLive -> JSON)

### 1) Configure and run report

In SeedLive:
- `Reports` -> `Saved Reports` -> `Daily Operations`
- Find `Day By Day Detail`
- Click the gear icon to **Configure**

Set parameters (see `how-to-gen-json/monthly-sales-step-1.png`):
- Date range: monthly billing period (5th -> 4th of following month)
- Transaction Type: all options ON (default)
- Header: `-- None --`
- Section: `-- None --`
- Row: `Day`
- Column: `Transaction Type`
- Data Values: only:
  - `Sale Amount`
  - `# of Items`
- Format: leave default `Html`
- Companies / Regions / Devices: expand company and leave only the target region checked

Click **Run Report**.

### 2) Export JSON

On report results page (see `how-to-gen-json/monthly-sales-results-from-step-1.png`):
- Click the far-right JSON export icon (see arrow in `how-to-gen-json/monthly-sales-step-2.png`)

This downloads a file like:
- `Activity Analysis - All from January 05 2026 to February 04 2026.json`

## Run the Calculator

From project root:

```bash
node zvsales.js "/full/path/to/Activity Analysis - All from January 05 2026 to February 04 2026.json"
```

Optional COG override:

```bash
node zvsales.js "/full/path/to/input.json" --cog 50
```

Optional env overrides:
- `PROC_FIXED` default `9.95`
- `PROC_RATE` default `0.0595`
- `REV_SHARE` default `0.25`
- `COG_RATE` default `50` (percent; script also accepts decimal form like `0.50`)

## Automated Workflow (Playwright CLI)

`scripts/monthly-auto.js` automates:
1. Open SeedLive
2. Navigate to saved report config
3. Apply the required report settings
4. Run report
5. Click JSON export
6. Save file to `input/json/`
7. Validate JSON shape
8. Run `zvsales.js` against the downloaded file

### Usage

Required:
- `--start YYYY-MM-DD`
- `--end YYYY-MM-DD`
- `--commission-pct <number>` (e.g. `25` for 25% or `20` for 20%)

Example:

```bash
npm run monthly:auto -- --start 2026-01-05 --end 2026-02-04 --location-key old-bridge-ymca --commission-pct 25
```

Run headed (visible browser):

```bash
npm run monthly:auto -- --start 2026-01-05 --end 2026-02-04 --location-key old-bridge-ymca --commission-pct 25 --headed
```

Run full pipeline including branded PDF:

```bash
npm run monthly:auto -- --start 2026-01-05 --end 2026-02-04 --location-key old-bridge-ymca --commission-pct 25 --headed --generate-pdf
```

### CLI Options

- `--start <YYYY-MM-DD>` report start date (required)
- `--end <YYYY-MM-DD>` report end date (required)
- `--location-key <key>` location target (required): `old-bridge-ymca` or `manasquan-field-house`
- `--commission-pct <number>` commission percent (required), e.g. `25` (YMCA) or `20` (Manasquan)
- `--headed` run browser with UI (default headless)
- `--base-url <url>` SeedLive base URL (default `https://seedlive.com`)
- `--home-url <url>` home page URL (default `https://seedlive.com/home.i`)
- `--login-url <url>` login page URL (default `https://seedlive.com/login.i`)
- `--params-url <url>` direct parameters page URL (defaults to your current Activity Analysis URL)
- `--download-dir <path>` where JSON gets saved (default `input/json`)
- `--profile-dir <path>` Playwright persistent profile dir (default `.playwright-profile`)
- `--username <value>` optional login username
- `--password <value>` optional login password
- `--run-zvsales` run `zvsales.js` after export (default true)
- `--no-run-zvsales` skip payout calculation step
- `--generate-pdf` or `--pdf` generate branded client PDF after export
- `--no-generate-pdf` skip PDF generation (default)
- `--zvsales-path <path>` path to calculator script (default `zvsales.js`)
- `--pdf-script-path <path>` PDF generator script path (default `scripts/generate-client-report-pdf.js`)
- `--pdf-to <text>` recipient line for PDF (`To:`)
- `--pdf-location <text>` location line in PDF intro
### Location Key Mapping

`monthly-auto` now selects exactly one SeedLive region before running the report:

- `old-bridge-ymca` -> `Middlesex County` (region value `164397_414117`)
- `manasquan-field-house` -> `Monmouth County` (region value `164397_414119`)

Behavior:
- The script expands the company tree if needed.
- It unchecks all region checkboxes.
- It checks only the mapped region for the selected `--location-key`.

Suggested commission values:
- `old-bridge-ymca` -> `--commission-pct 25`
- `manasquan-field-house` -> `--commission-pct 20`

PDF defaults by location key (can still be overridden with CLI flags):
- `old-bridge-ymca` -> `--pdf-to "Old Bridge YMCA Leadership Team"`, `--pdf-location "Old Bridge YMCA"`
- `manasquan-field-house` -> `--pdf-to "Manasquan Field House Leadership Team"`, `--pdf-location "Manasquan Field House"`

- `--pdf-date <YYYY-MM-DD>` report date shown in PDF
- `--pdf-out <path>` exact output PDF path
- `--timeout-ms <number>` per-step timeout (default `30000`)
- `--report-timeout-ms <number>` wait limit for report generation/results (default `180000`)
- `--step-delay-ms <number>` delay between major steps for UI/session stability (default `500`)
- `--help` show usage

### Authentication Notes

- Script uses a persistent browser profile so an existing authenticated session can be reused.
- First run is easiest with `--headed`; complete login/MFA once and session should persist.
- You can also pass `--username` and `--password` to attempt form-based login automation.

## Current Known Limitations

- SeedLive selectors are based on current UI labels; UI changes may require selector updates.
- If the JSON export icon attributes change, the click selector may need tuning.
- No scheduled runner yet; current flow is manual command invocation.

## Project Structure

- `zvsales.js` payout calculator
- `scripts/monthly-auto.js` SeedLive automation + download + calculator trigger
- `scripts/generate-client-report-pdf.js` one-page branded client PDF
- `input/json/` downloaded report files
- `how-to-gen-json/` screenshot references for manual steps

## One-Page Branded PDF

Generate a client-ready single-page PDF using your logo and monthly numbers:

```bash
npm run report:pdf -- --input "input/json/Activity Analysis - All from January 05 2026 to February 04 2026.json" --location "Old Bridge YMCA"
```

Defaults:
- To: `Client Leadership Team`
- Logo: `images/master-brand.png`
- Output directory: `reporting/`
- COG / fee rates: same defaults as calculator (`COG=50%`, `PROC_FIXED=9.95`, `PROC_RATE=0.0595`, `REV_SHARE=25%`)

Optional args:
- `--out <path>` exact output PDF file path
- `--from <name>` sender line
- `--subject <text>` subject line
- `--date <YYYY-MM-DD>` report date shown in PDF

