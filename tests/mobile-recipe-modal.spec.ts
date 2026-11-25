import { devices, expect, test } from "@playwright/test";
import { joinAsHost, startRestaurantShift } from "./helpers";
import { TEST_CLIENT_URL } from "./ports";

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now()}-${userSeq++}`;

test("T1: the recipe guide modal does not overflow on a portrait phone", async ({ browser }) => {
  // A phone held upright (touch, portrait viewport): forceLandscape.ts turns the whole page
  // with CSS (body.force-landscape), the layout the horizontal overflow bug showed in.
  // Manually created contexts don't inherit the config's use options, so pass baseURL along
  // (same as playwright.config.ts: the Vite dev server on 5174).
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    deviceScaleFactor: 1,
    baseURL: TEST_CLIENT_URL,
  });
  const page = await context.newPage();
  try {
    await joinAsHost(page, uniqueUser());
    await startRestaurantShift(page);
    await expect(page.locator("body.force-landscape")).toBeAttached();

    // Open the guide ("?") of the first order's first drink.
    await page.locator(".order-drink .help-btn").first().click();
    const card = page.locator(".modal-card");
    await expect(card).toBeVisible();

    // No horizontal scroll inside the card.
    const overflowX = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflowX).toBeLessThanOrEqual(0);

    // Every step sits inside the card frame (the page is turned, so rects come back rotated
    // too; containment survives the transform). A tall guide scrolls vertically inside the
    // card, so bring each step into view before measuring. 1px slack for sub-pixel rounding.
    const stepsInside = await card.evaluate((el) => {
      const cardRect = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll<HTMLElement>(".guide-step")).map((step) => {
        step.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = step.getBoundingClientRect();
        return (
          r.left >= cardRect.left - 1 &&
          r.right <= cardRect.right + 1 &&
          r.top >= cardRect.top - 1 &&
          r.bottom <= cardRect.bottom + 1
        );
      });
    });
    expect(stepsInside.length).toBeGreaterThan(0);
    for (const inside of stepsInside) expect(inside).toBe(true);
  } finally {
    await context.close();
  }
});
