import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const outputDir = path.resolve("docs/article/assets");
const dataDir = path.resolve("docs/article/data");
const chromePaths = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

await mkdir(outputDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

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

async function capture(name) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true,
  });
}

async function exportData(name) {
  for (const format of ["CSV", "JSON"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(path.join(dataDir, `${name}.${format.toLowerCase()}`));
  }
}

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("CODE UNDER TEST").waitFor();
await page.getByRole("button", { name: "Run × 1", exact: true }).click();
await page.getByRole("button", { name: "Run × 1", exact: true }).waitFor();
await capture("01-clean");
await exportData("clean");

await page.getByRole("button", { name: "Isolated", exact: true }).click();
await page.getByRole("button", { name: "3", exact: true }).click();
await page.getByRole("button", { name: /01 Replace type with any/ }).click();
await page.getByRole("button", { name: "Run × 3", exact: true }).waitFor();
await capture("02-isolated-three-trials");
await exportData("isolated-three-trials");

await page.getByRole("button", { name: "Reset", exact: true }).click();
await page.getByRole("button", { name: "Cumulative", exact: true }).click();
await page.getByRole("button", { name: "1", exact: true }).click();

for (const [index, label] of [
  /01 Replace type with any/,
  /02 Remove validation/,
  /03 Swallow exception/,
  /04 SQL concatenation/,
  /05 Add eval/,
].entries()) {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: "Run × 1", exact: true }).waitFor();
  if (index === 2) await capture("03-cumulative-midpoint");
}

await capture("04-cumulative-reject");
await exportData("cumulative-boundary");
await browser.close();

console.log(`Saved screenshots to ${outputDir}`);
console.log(`Saved experiment data to ${dataDir}`);
