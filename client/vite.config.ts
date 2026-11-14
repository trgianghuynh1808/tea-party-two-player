import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true, // allow a second player on the LAN to connect
  },
});
