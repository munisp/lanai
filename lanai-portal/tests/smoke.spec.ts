import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";

async function loginAsAdvisor(page: Page) {
  // dev-login sets a cookie via 302 redirect
  await page.goto(`${BASE}/api/oauth/dev-login`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
}

const ADVISOR_PAGES = [
  ["/", "Dashboard"],
  ["/clients", "Clients"],
  ["/travel-requests", "Travel Requests"],
  ["/members", "Members"],
  ["/member-management", "Member Management"],
  ["/proposals", "Proposal Engine"],
  ["/intelligence", "Client Intelligence"],
  ["/briefing", "Morning Briefing"],
  ["/suppliers", "Suppliers"],
  ["/supplier-services", "Supplier Services"],
  ["/whatsapp", "WhatsApp"],
  ["/inbox", "Chatwoot Inbox"],
  ["/chatwoot", "Chatwoot"],
  ["/communication-hub", "Communication Hub"],
  ["/analytics", "Revenue Analytics"],
  ["/invoicing", "Invoicing"],
  ["/celebrations", "Celebrations"],
  ["/nps", "NPS"],
  ["/trip-timeline", "Trip Timeline"],
  ["/ai-concierge", "AI Concierge"],
  ["/task-templates", "Task Templates"],
  ["/member/1", "Member Profile"],
  ["/settings", "Settings"],
];

test.describe("Lanai Advisor Portal — full smoke test", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message));
    (page as any).__errors = errors;
  });

  test("all advisor pages load without JS errors", async ({ page }) => {
    await loginAsAdvisor(page);
    const allErrors: Record<string, string[]> = {};
    for (const [path, name] of ADVISOR_PAGES) {
      const errors = (page as any).__errors as string[];
      errors.length = 0;
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const hasErrorText = await page.locator("text=Something went wrong").count();
      const title = await page.title();
      expect(resp?.status(), `${name} (${path}) status`).toBeLessThan(500);
      if (errors.length || hasErrorText) {
        allErrors[path] = [...errors];
      }
      console.log(`PAGE ${path} [${name}] status=${resp?.status()} errors=${errors.length}`);
    }
    if (Object.keys(allErrors).length) {
      console.log("ERRORS:\n" + JSON.stringify(allErrors, null, 2));
    }
    expect(Object.keys(allErrors).length, "pages with JS errors: " + JSON.stringify(allErrors)).toBe(0);
  });

  test("Proposal Engine generates a proposal", async ({ page }) => {
    await loginAsAdvisor(page);
    await page.goto(`${BASE}/proposals`, { waitUntil: "networkidle" });
    // fill the form and submit
    const textarea = page.locator("textarea").first();
    await textarea.fill("Luxury honeymoon in the Maldives for 2, budget £40,000, December");
    await page.getByRole("button", { name: /generate/i }).first().click();
    await page.waitForTimeout(15000);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(200);
    console.log("PROPOSAL page rendered chars:", bodyText.length);
  });

  test("Client Intelligence runs analysis", async ({ page }) => {
    await loginAsAdvisor(page);
    await page.goto(`${BASE}/intelligence`, { waitUntil: "networkidle" });
    const input = page.locator("input[placeholder*='client']").first();
    await input.fill("Sarah Chen");
    await page.getByRole("button", { name: /run analysis/i }).first().click();
    await page.waitForTimeout(15000);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(100);
    expect(bodyText.toLowerCase()).not.toContain("sign in");
    console.log("INTELLIGENCE rendered chars:", bodyText.length);
  });

  test("Morning Briefing generates", async ({ page }) => {
    await loginAsAdvisor(page);
    await page.goto(`${BASE}/briefing`, { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: /generate|briefing/i }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(15000);
    }
    const bodyText = await page.locator("body").innerText();
    console.log("BRIEFING rendered chars:", bodyText.length);
  });

  test("WhatsApp inbox shows conversations", async ({ page }) => {
    await loginAsAdvisor(page);
    await page.goto(`${BASE}/whatsapp`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const bodyText = await page.locator("body").innerText();
    console.log("WHATSAPP rendered chars:", bodyText.length);
    expect(bodyText.length).toBeGreaterThan(100);
  });
});
