import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));

  // login
  await page.goto(`${BASE}/api/oauth/dev-login`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  // ---- Proposal Engine ----
  console.log("=== PROPOSAL ENGINE ===");
  await page.goto(`${BASE}/proposals`, { waitUntil: "networkidle" });
  await sleep(500);
  await page.locator("input[placeholder*='Harrington']").fill("The Harrington Family");
  await page.locator("input[placeholder*='Japan, Maldives']").fill("Maldives");
  await page.getByRole("button", { name: /generate/i }).first().click();
  await sleep(25000);
  let txt = await page.locator("body").innerText();
  console.log("rendered chars:", txt.length, "| has proposal text:", /maldives|itinerary|proposal|executive/i.test(txt));
  console.log("errors:", errors.filter((e) => /proposal/i.test(e)).slice(0, 3));

  // ---- Client Intelligence ----
  console.log("=== CLIENT INTELLIGENCE ===");
  errors.length = 0;
  await page.goto(`${BASE}/intelligence`, { waitUntil: "networkidle" });
  await sleep(500);
  const input = page.locator("input[placeholder*='client']").first();
  await input.fill("Sarah Chen");
  await page.getByRole("button", { name: /run analysis/i }).first().click();
  await sleep(20000);
  txt = await page.locator("body").innerText();
  console.log("rendered chars:", txt.length, "| has intelligence:", /preference|engagement|churn/i.test(txt));
  console.log("errors:", errors.slice(0, 3));

  // ---- Morning Briefing ----
  console.log("=== MORNING BRIEFING ===");
  errors.length = 0;
  await page.goto(`${BASE}/briefing`, { waitUntil: "networkidle" });
  await sleep(500);
  const bbtn = page.getByRole("button", { name: /generate|briefing/i }).first();
  if (await bbtn.count()) { await bbtn.click(); await sleep(20000); }
  txt = await page.locator("body").innerText();
  console.log("rendered chars:", txt.length, "| has briefing:", /briefing|follow|good morning/i.test(txt));
  console.log("errors:", errors.slice(0, 3));

  // ---- WhatsApp inbox ----
  console.log("=== WHATSAPP INBOX ===");
  errors.length = 0;
  await page.goto(`${BASE}/whatsapp`, { waitUntil: "networkidle" });
  await sleep(2500);
  txt = await page.locator("body").innerText();
  console.log("rendered chars:", txt.length, "| shows conversation:", /whatsapp|inbox|sarah|beryl|4015/i.test(txt));

  await browser.close();
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
