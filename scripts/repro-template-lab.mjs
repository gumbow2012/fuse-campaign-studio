import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const email = process.env.TEST_EMAIL ?? "gumbow2012@gmail.com";
const password = process.env.TEST_PASSWORD ?? "#Kadwan2016";
const injectedSession = process.env.SUPABASE_SESSION_JSON
  ? JSON.parse(process.env.SUPABASE_SESSION_JSON)
  : null;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

page.on("console", (message) => {
  console.log(`[console:${message.type()}] ${message.text()}`);
});

page.on("pageerror", (error) => {
  console.log(`[pageerror] ${error.stack ?? error.message}`);
});

page.on("requestfailed", (request) => {
  console.log(`[requestfailed] ${request.method()} ${request.url()} -> ${request.failure()?.errorText}`);
});

page.on("response", async (response) => {
  if (response.status() >= 400) {
    console.log(`[response:${response.status()}] ${response.request().method()} ${response.url()}`);
  }
});

if (injectedSession) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("sb-ykrrwgkxgidoavtzcumk-auth-token", JSON.stringify(session));
  }, injectedSession);
  await page.goto(`${baseUrl}/app/lab/templates`, { waitUntil: "networkidle" });
} else {
  await page.goto(`${baseUrl}/auth`, { waitUntil: "networkidle" });

  const inputs = page.locator("input");
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForLoadState("networkidle");
  await page.goto(`${baseUrl}/app/lab/templates`, { waitUntil: "networkidle" });
}

await page.waitForTimeout(3000);

const bodyText = await page.textContent("body");
console.log("[url]", page.url());
console.log("[body-length]", bodyText?.trim().length ?? 0);

await page.screenshot({ path: "tmp/template-lab-repro.png", fullPage: true });

await browser.close();
