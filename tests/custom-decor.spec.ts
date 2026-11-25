import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { joinAsHost } from "./helpers";
import { TEST_SERVER_URL } from "./ports";

/**
 * Custom furniture e2e (task .agents/tasks/2026-11-25-task-05-hien-tai-moi-lan-them-noi-that-deu-phai.md):
 * - T1 drives the admin + public API directly (create / list / image / validation / delete).
 * - T2 drives the portal's upload -> analyze -> define -> save flow on /portal.
 * - T3 checks that a saved piece shows up in both Build and Decorate for a fresh player page.
 * playwright.config.ts starts the server with ADMIN_TOKEN=test-admin-token; a dev server without
 * the token would answer 404 instead of 401 on the admin routes.
 */
const SERVER = TEST_SERVER_URL;
const ADMIN_TOKEN = "test-admin-token";
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;
/** Unique labels per test run: custom pieces persist in the shared store between tests. */
const uniqueLabel = (prefix: string) => `${prefix} ${Date.now().toString(36)}${userSeq++}`;

/** Decode an admin list response. */
async function customItems(request: APIRequestContext): Promise<{ kind: string; label: string; price: number; image?: string }[]> {
  const res = await request.get(`${SERVER}/admin/custom-decor`, { headers: AUTH });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { items: { kind: string; label: string; price: number; image?: string }[] }).items;
}

/** Delete a custom piece if it still exists (404 after an earlier delete is fine). */
async function deleteCustomPiece(request: APIRequestContext, kind: string | undefined): Promise<void> {
  if (!kind) return;
  await request.delete(`${SERVER}/admin/custom-decor/${encodeURIComponent(kind)}`, { headers: AUTH });
}

/** A valid PNG of the given size, drawn in a blank page (canvas -> dataURL -> base64 without prefix). */
async function makePng(page: Page, width: number, height: number): Promise<string> {
  await page.goto("about:blank");
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL("image/png");
    },
    { width, height },
  );
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

test("T1: custom decor API — create (auto kind), public list/image, bad image and bad price are 400, delete, no token is 401", async ({
  page,
  request,
}) => {
  const label = uniqueLabel("Ghe");
  const imageBase64 = await makePng(page, 8, 8);
  let kind: string | undefined;

  try {
    // No token: the admin middleware answers 401 before the route runs.
    const noAuth = await request.post(`${SERVER}/admin/custom-decor`, {
      data: { def: { label, price: 55 }, imageBase64 },
    });
    expect(noAuth.status()).toBe(401);

    // 1. Create with auth: no kind sent, the server derives one from the label.
    const created = await request.post(`${SERVER}/admin/custom-decor`, {
      headers: AUTH,
      data: {
        def: {
          label,
          price: 55,
          category: "seating",
          layer: "object",
          width: 30,
          height: 20,
          imageHeight: 50,
          rotation: "flip",
          role: "seat",
        },
        imageBase64,
      },
    });
    expect(created.status()).toBe(200);
    const createdBody = (await created.json()) as { ok: boolean; def: { kind: string; price: number } };
    expect(createdBody.ok).toBe(true);
    expect(createdBody.def.kind).toMatch(/^custom_/);
    kind = createdBody.def.kind;

    // 2. The public list (no token) has it with the right price and image URL.
    const publicList = await request.get(`${SERVER}/custom-decor`);
    expect(publicList.status()).toBe(200);
    const items = ((await publicList.json()) as { items: { kind: string; price: number; image: string }[] }).items;
    const item = items.find((i) => i.kind === kind);
    expect(item).toMatchObject({ price: 55 });
    expect(item!.image.endsWith(`/${kind}.png`)).toBe(true);

    // 3. The cut-out PNG is served with image/png.
    const image = await request.get(`${SERVER}/custom-decor/${kind}.png`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");

    // 4. imageBase64 that is not a PNG is rejected.
    const badImage = await request.post(`${SERVER}/admin/custom-decor`, {
      headers: AUTH,
      data: { def: { label: uniqueLabel("Loi"), price: 10, layer: "object", width: 30, height: 20 }, imageBase64: "not-a-png" },
    });
    expect(badImage.status()).toBe(400);

    // 5. A negative price is rejected.
    const badPrice = await request.post(`${SERVER}/admin/custom-decor`, {
      headers: AUTH,
      data: { def: { label: uniqueLabel("Loi"), price: -5, layer: "object", width: 30, height: 20 }, imageBase64 },
    });
    expect(badPrice.status()).toBe(400);

    // 6. Deleting the piece succeeds.
    const del = await request.delete(`${SERVER}/admin/custom-decor/${encodeURIComponent(kind)}`, { headers: AUTH });
    expect(del.status()).toBe(200);

    // 7. The public list no longer has it.
    const afterDelete = await request.get(`${SERVER}/custom-decor`);
    expect(afterDelete.status()).toBe(200);
    const remaining = ((await afterDelete.json()) as { items: { kind: string }[] }).items;
    expect(remaining.some((i) => i.kind === kind)).toBe(false);
    kind = undefined;
  } finally {
    await deleteCustomPiece(request, kind);
  }
});

test("T2: portal analyze — an image with two items on white gives two cards, defining + saving one stores it and lists it", async ({
  page,
  request,
}) => {
  const label = uniqueLabel("Ghe");
  let kind: string | undefined;

  try {
    // Set the portal up first, then draw the 300x120 test image in that page.
    await page.goto(`${SERVER}/portal`);
    await page.fill("#tokenInput", ADMIN_TOKEN);
    await page.click("#loginBtn");
    await expect(page.locator("#openCustomBtn")).toBeVisible();

    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 120;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d32f2f";
      ctx.fillRect(30, 30, 40, 60);
      ctx.fillStyle = "#1976d2";
      ctx.fillRect(180, 35, 50, 50);
      return canvas.toDataURL("image/png");
    });
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

    // 1. Open the custom furniture section.
    await page.click("#openCustomBtn");
    await expect(page.locator("#customView")).toBeVisible();

    // 2. Pick the image, 3. analyze: two separate pieces are found.
    await page.locator("#customFile").setInputFiles({ name: "furniture.png", mimeType: "image/png", buffer });
    await page.click("#analyzeBtn");
    await expect(page.locator(".cd-candidate")).toHaveCount(2);

    // 4. Define the first piece and save it.
    const card = page.locator(".cd-candidate").first();
    await card.locator(".cd-form input").nth(0).fill(label);
    await card.locator(".cd-form input").nth(1).fill("70");
    await card.locator("select").nth(0).selectOption("seating");
    await card.locator("select").nth(1).selectOption("object");
    await card.getByRole("button", { name: "Lưu" }).click();
    await expect(card).toContainText("Đã lưu");

    // 5. The "added pieces" list has a row with the new name.
    await expect(page.locator("#customItemsBody tr", { hasText: label })).toHaveCount(1);

    // Cleanup through the API: find the kind by label.
    const item = (await customItems(request)).find((i) => i.label === label);
    expect(item).toBeDefined();
    kind = item!.kind;
    const del = await request.delete(`${SERVER}/admin/custom-decor/${encodeURIComponent(kind)}`, { headers: AUTH });
    expect(del.status()).toBe(200);
    kind = undefined;
  } finally {
    await deleteCustomPiece(request, kind);
  }
});

test("T3: a saved custom piece shows up in Build and (when enabled) in Decorate with its server image", async ({ page, request }) => {
  const label = uniqueLabel("Ghe");
  const imageBase64 = await makePng(page, 8, 8);
  let kind: string | undefined;

  try {
    // Create the piece BEFORE the player page opens: the client loads the catalog on page load.
    const created = await request.post(`${SERVER}/admin/custom-decor`, {
      headers: AUTH,
      data: {
        def: { label, price: 60, category: "seating", layer: "object", width: 30, height: 20, imageHeight: 50 },
        imageBase64,
      },
    });
    expect(created.status()).toBe(200);
    kind = ((await created.json()) as { def: { kind: string } }).def.kind;
    expect(kind).toMatch(/^custom_/);

    // 1. A fresh player joins (players start in the yard).
    await joinAsHost(page, uniqueUser());

    // 2. Build mode lists the custom piece.
    await expect(page.locator("#build-btn")).toBeEnabled();
    await page.click("#build-btn");
    await expect(page.locator("#build-panel .build-item").first()).toBeVisible();
    await expect(page.locator("#build-panel .build-item", { hasText: label })).toHaveCount(1);

    // 3. Close Build, then check Decorate if it is enabled from the yard.
    await page.click("#build-btn");
    if (await page.locator("#decorate-btn").isEnabled()) {
      await page.click("#decorate-btn");
      await page.evaluate(() =>
        document.querySelectorAll<HTMLDetailsElement>("#decor-panel details.decor-section").forEach((s) => (s.open = true)),
      );
      const card = page.locator("#decor-panel .decor-item", { hasText: label });
      await expect(card).toHaveCount(1);
      const img = card.locator("img.swatch-img");
      await expect(img).toHaveAttribute("src", new RegExp(`^https?://.+/${kind}\\.png$`));
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Decorate không bật được khi còn ở sân; chỉ kiểm tra phần Build.",
      });
    }

    // 4. Cleanup (the player never bought the piece, so the delete is allowed).
    const del = await request.delete(`${SERVER}/admin/custom-decor/${encodeURIComponent(kind)}`, { headers: AUTH });
    expect(del.status()).toBe(200);
    kind = undefined;
  } finally {
    await deleteCustomPiece(request, kind);
  }
});
