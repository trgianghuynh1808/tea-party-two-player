import { expect, test } from "@playwright/test";
import { DRINKS, STATIONS, StationType, getVenue, isValidPartial, type IngredientId, type StationDef } from "@boba/shared";
import { joinAsHost } from "./helpers";

/** T1: labels of the tea shop's back stations (the cup shelf + the 9 ingredient machines). */
const EXPECTED_LABELS = [
  "Kệ ly",
  "Trà đen",
  "Trà xanh",
  "Trân châu",
  "Kem cheese",
  "Chanh dây",
  "Sữa",
  "Cam",
  "Dưa hấu",
  "Chanh",
];

/** The tea-side machines left of the shared milk, and the fruit-juice machines right of it. */
const TEA_INGREDIENTS: IngredientId[] = ["black_tea", "green_tea", "pearl", "cheese_foam", "passion"];
const JUICE_INGREDIENTS: IngredientId[] = ["orange", "watermelon", "lemon"];

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

test("T2: milk splits the machine row (teas left, juices right) and tea/juice ingredients never mix", () => {
  const machines = STATIONS.filter((s): s is StationDef => s.type === StationType.Machine).sort((a, b) => a.x - b.x);
  const milk = machines.find((s) => s.ingredient === "milk");
  expect(milk, "the shared milk machine exists").toBeDefined();

  const left = machines.filter((s) => s.x < milk!.x);
  const right = machines.filter((s) => s.x > milk!.x);
  expect(left.map((s) => s.ingredient), "teas + toppings on the left of milk").toEqual(TEA_INGREDIENTS);
  expect(right.map((s) => s.ingredient), "orange, watermelon and lemon on the right of milk").toEqual(JUICE_INGREDIENTS);

  // A tea start cannot become a juice and vice versa (no recipe mixes them); milk is shared with fruit.
  expect(isValidPartial(["black_tea", "orange"])).toBe(false);
  expect(isValidPartial(["orange", "black_tea"])).toBe(false);
  expect(isValidPartial(["watermelon", "milk"])).toBe(true);

  // Every recipe keeps tea and juice apart.
  for (const drink of DRINKS) {
    const hasTea = drink.steps.some((s) => TEA_INGREDIENTS.includes(s));
    const hasJuice = drink.steps.some((s) => JUICE_INGREDIENTS.includes(s));
    expect(hasTea && hasJuice, `${drink.id} mixes tea and juice`).toBe(false);
  }

  // The shift is longer and customers wait longer than before.
  const shop = getVenue("shop");
  expect(shop.shiftSeconds).toBeGreaterThan(180);
  expect(shop.durationStart).toBeGreaterThan(60);
});

/** Station x/y are the centre of its width x height rectangle (top-down 3/4 view). */
const rectsOverlap = (a: StationDef, b: StationDef) =>
  Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;

test("T1: hai kệ ly — đúng 2 kệ, kệ mới (cup_shelf_2) ở bên phải, không chồng station nào", () => {
  const shelves = STATIONS.filter((s) => s.type === StationType.CupShelf);
  expect(shelves, "exactly two cup shelves").toHaveLength(2);

  const rightmost = shelves.slice().sort((a, b) => a.x - b.x).at(-1)!;
  expect(rightmost.id, "the new shelf is cup_shelf_2").toBe("cup_shelf_2");
  expect(rightmost.x, "the new shelf is on the right half of the shop").toBeGreaterThan(480);

  // No station's rectangle overlaps either shelf (stations are axis-aligned rectangles centred on x/y).
  for (const shelf of shelves) {
    const collisions = STATIONS.filter((s) => s.id !== shelf.id && rectsOverlap(shelf, s));
    expect(collisions, `${shelf.id} overlaps: ${collisions.map((s) => s.id).join(", ")}`).toEqual([]);
  }
});
