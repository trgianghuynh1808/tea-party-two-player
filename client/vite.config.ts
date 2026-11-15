import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the site under /<repo-name>/; the CD workflow sets BASE_PATH.
  base: process.env.BASE_PATH || "/",
  server: {
    port: 5173,
    host: true, // allow a second player on the LAN to connect
  },
});
