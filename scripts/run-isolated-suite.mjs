import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const assetDir = path.resolve("docs/article/assets");
const dataDir = path.resolve("docs/article/data");
const chromePaths = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

await Promise.all([
  mkdir(assetDir, { recursive: true }),
  mkdir(dataDir, { recursive: true }),
]);

let browser;
let launchError;
for (const executablePath of chromePaths) {
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    break;
  } catch (error) {
    launchError = error;
  }
}

if (!browser) {
  throw new Error(`Chromeを起動できませんでした。CHROME_PATHを指定してください。\n${launchError}`);
}

const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});

async function waitForTrials() {
  await page.getByRole("button", { name: "Run × 3", exact: true }).waitFor();
}

async function exportData() {
  for (const format of ["CSV", "JSON"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(
      path.join(dataDir, `isolated-remaining-mutations.${format.toLowerCase()}`),
    );
  }
}

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("CODE UNDER TEST").waitFor();
await page.getByRole("button", { name: "Isolated", exact: true }).click();
await page.getByRole("button", { name: "3", exact: true }).click();

for (const mutation of [
  /02 Remove validation/,
  /03 Swallow exception/,
  /04 SQL concatenation/,
  /05 Add eval/,
]) {
  await page.getByRole("button", { name: mutation }).click();
  await waitForTrials();
}

await page.screenshot({
  path: path.join(assetDir, "05-isolated-all-mutations.png"),
  fullPage: true,
});
await exportData();
await browser.close();

console.log("Saved the remaining isolated experiment results.");
