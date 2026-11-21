import { expect, test } from "@playwright/test";
import { joinAsHost, startRestaurantShift } from "./helpers";

/**
 * Container line text as rendered by OrdersPanel: "<icon> Bày ra <container>". Icons use codepoint
 * escapes to be exact (plate is fork-and-knife + text variation selector): 🍽️ 🥣 🥤.
 */
const INTO_TEXT = /^(\u{1F37D}\u{FE0F}|\u{1F963}|\u{1F964}) Bày ra (đĩa|tô|ly)$/u;

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now()}-${userSeq++}`;

test("T1: the container line is the last step of every restaurant recipe", async ({ page }) => {
  await joinAsHost(page, uniqueUser());
  await startRestaurantShift(page);

  const recipes = await page.locator("#orders-panel .order-drink .parts").evaluateAll((blocks) =>
    blocks.map((block) => {
      const into = block.querySelector(".part-into");
      return {
        intoCount: block.querySelectorAll(".part-into").length,
        intoIsLastChild: !!into && into === block.lastElementChild,
        // DOM order: every .part row comes before .part-into.
        partsBeforeInto:
          !!into &&
          Array.from(block.children)
            .filter((child) => child.classList.contains("part"))
            .every((child) => !!(child.compareDocumentPosition(into!) & Node.DOCUMENT_POSITION_FOLLOWING)),
      };
    }),
  );
  expect(recipes.length).toBeGreaterThan(0);
  for (const recipe of recipes) {
    expect(recipe.intoCount).toBe(1);
    expect(recipe.intoIsLastChild).toBe(true);
    expect(recipe.partsBeforeInto).toBe(true);
  }
});

test("T2: the container line reads '<icon> Bày ra <container>' and the old wording is gone", async ({ page }) => {
  await joinAsHost(page, uniqueUser());
  await startRestaurantShift(page);

  const intoLines = page.locator("#orders-panel .part-into");
  const count = await intoLines.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(intoLines.nth(i)).toHaveText(INTO_TEXT);
  }

  const panel = page.locator("#orders-panel");
  await expect(panel).not.toContainText("Cầm");
  await expect(panel).not.toContainText("đi gom");
});

test("T3: the container line is separated by a dashed top border", async ({ page }) => {
  await joinAsHost(page, uniqueUser());
  await startRestaurantShift(page);

  const styles = await page.locator("#orders-panel .part-into").evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.borderTopStyle, width: cs.borderTopWidth };
    }),
  );
  expect(styles.length).toBeGreaterThan(0);
  for (const { style, width } of styles) {
    expect(style).toBe("dashed");
    expect(width).toBe("1px");
  }
});
