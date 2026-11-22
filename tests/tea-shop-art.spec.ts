import { expect, test } from "@playwright/test";
import { joinAsHost } from "./helpers";

/** T1: labels of the tea shop's back stations (the cup shelf + the 6 ingredient machines). */
const EXPECTED_LABELS = ["Kệ ly", "Trà đen", "Trà xanh", "Sữa", "Trân châu", "Kem cheese", "Chanh dây"];

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now()}-${userSeq++}`;

test("T1: the tea shop loads with the new counter art and every back station shows its label", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await joinAsHost(page, uniqueUser());

  // Poll until the scene has booted and every back station label is rendered
  // (timed machines append a " ⏱…" suffix, so check by substring).
  await page.waitForFunction(
    (expected: string[]) => {
      const labels = (window as unknown as { __GAME__?: { stationLabels(): string[] } }).__GAME__?.stationLabels() ?? [];
      const text = labels.join("\n");
      return expected.every((label) => text.includes(label));
    },
    EXPECTED_LABELS,
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
