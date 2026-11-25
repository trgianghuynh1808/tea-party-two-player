import { expect, test } from "@playwright/test";

test("T1: the favicon is declared and the svg loads", async ({ page }) => {
  await page.goto("/?test=1");

  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("type", "image/svg+xml");

  const href = await icon.getAttribute("href");
  expect(href).toBeTruthy();

  const url = new URL(href!, page.url()).toString();
  const response = await page.request.get(url);

  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("svg");
  expect(await response.text()).toContain("<svg");
});
