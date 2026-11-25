// Portal-added custom furniture, fetched from the game server on page load (before the first join)
// and merged into the shared catalog, so decorate mode, build mode and the scene preload all see it.

import { CUSTOM_DECOR_URL, addCustomDecoration, parseCustomDecoration } from "@boba/shared";

/**
 * Fetch the admin-added furniture from `${endpoint}/custom-decor` and merge it into the shared catalog.
 * Each artwork URL is rewritten to an absolute game-server URL: the cut-out PNGs live there, not in /assets.
 * Never throws: an unreachable server just means the built-in catalog keeps working.
 */
export async function loadCustomCatalog(endpoint: string): Promise<void> {
  try {
    const res = await fetch(`${endpoint}/${CUSTOM_DECOR_URL}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { items?: unknown[] };
    for (const raw of body.items ?? []) {
      const def = parseCustomDecoration(raw);
      if (!def) continue;
      def.image = `${endpoint}/${CUSTOM_DECOR_URL}/${def.kind}.png`;
      addCustomDecoration(def);
    }
  } catch (err) {
    console.warn("Custom furniture catalog unavailable", err);
  }
}

/** Absolute URL for a decoration image: server URLs stay as they are, local art is served by the client. */
export function decorImageUrl(image: string): string {
  return /^https?:/i.test(image) ? image : `${import.meta.env.BASE_URL}${image}`;
}
