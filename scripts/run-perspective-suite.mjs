import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const assetDir = path.resolve("docs/article/assets");
const dataDir = path.resolve("docs/article/data");
const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await Promise.all([mkdir(assetDir, { recursive: true }), mkdir(dataDir, { recursive: true })]);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

async function exportResults(name) {
  for (const format of ["CSV", "JSON"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(path.join(dataDir, `${name}.${format.toLowerCase()}`));
  }
}

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByText("CODE UNDER TEST").waitFor();

for (const perspective of [
  { button: "Prod", slug: "production" },
  { button: "Security", slug: "security" },
  { button: "Maintain", slug: "maintainability" },
]) {
  await page.getByRole("button", { name: perspective.button, exact: true }).click();
  await page.getByRole("button", { name: "Isolated", exact: true }).click();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: /04 SQL concatenation/ }).click();
  await page.getByRole("button", { name: "Run × 3", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(assetDir, `06-perspective-${perspective.slug}.png`),
    fullPage: true,
  });
  await exportResults(`perspective-${perspective.slug}`);
}

await browser.close();
console.log("Saved perspective comparison results.");
