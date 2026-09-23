// One-off manual visual check of the dashboard via Playwright — not part of the test suite.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:5175";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(base);
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/dash-list.png" });

const firstSession = page.locator("ul li a").first();
await firstSession.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "/tmp/dash-session-list-tab.png" });

await page.getByRole("button", { name: "Graph" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/dash-session-graph-tab.png" });

await page.getByRole("button", { name: "DOM" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/dash-dom-tab.png" });

await page.getByRole("button", { name: "CSS" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/dash-css-tab.png" });

await page.getByRole("button", { name: "Network" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/dash-network-tab.png" });

await page.getByRole("button", { name: "Events" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/dash-events-tab.png" });

await page.getByRole("button", { name: "States" }).click();
await page.getByRole("button", { name: "Compare" }).click();
await page.locator("aside input[type=checkbox]").nth(0).click();
await page.locator("aside input[type=checkbox]").nth(1).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/dash-compare.png" });

console.log("console/page errors:", JSON.stringify(errors, null, 2));
await browser.close();
