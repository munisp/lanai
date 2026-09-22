const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "https://lanai.newfire.app";

async function checkPage(browser, path, expectText) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  const broken = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 500) broken.push(`${r.status()} ${r.url()}`); });

  // dev login (sets cookie on this context)
  await page.goto(`${BASE}/api/oauth/dev-login`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const found = await page.getByText(expectText, { timeout: 10000 }).first().isVisible().catch(() => false);
  const realErrors = errors.filter((e) => !/favicon|umami|analytics/i.test(e));
  console.log(`\n=== ${path} ===`);
  console.log(`  expected text "${expectText}": ${found ? "FOUND" : "MISSING"}`);
  console.log(`  JS errors: ${realErrors.length ? realErrors.join(" | ") : "none"}`);
  console.log(`  broken (5xx) requests: ${broken.length ? broken.join(" | ") : "none"}`);
  await ctx.close();
  return { found, errors: realErrors, broken };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  results.push(await checkPage(browser, "/", "Maldives"));
  results.push(await checkPage(browser, "/clients", "Eleanor Hart"));
  results.push(await checkPage(browser, "/members", "Marcus Chen"));
  results.push(await checkPage(browser, "/travel-requests", "Maldives"));
  results.push(await checkPage(browser, "/proposal-engine", "Proposal"));
  results.push(await checkPage(browser, "/intelligence", "Intelligence"));
  results.push(await checkPage(browser, "/briefing", "Briefing"));
  await browser.close();

  const allOk = results.every((r) => r.found && r.errors.length === 0 && r.broken.length === 0);
  console.log(`\n==== SMOKE SUMMARY: ${allOk ? "PASS" : "FAIL"} ====`);
  process.exit(allOk ? 0 : 1);
})();
