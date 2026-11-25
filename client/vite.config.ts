import { defineConfig, type Plugin } from "vite";

// One id per client build: the client embeds it and polls version.json to detect a newer deploy.
const buildId = process.env.BUILD_ID || `${Date.now().toString(36)}`;

function versionPlugin(isBuild: boolean): Plugin {
  const id = isBuild ? buildId : "dev";
  return {
    name: "boba-version",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id }) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0].endsWith("/version.json")) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ id }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site under /<repo-name>/; the CD workflow sets BASE_PATH.
  base: process.env.BASE_PATH || "/",
  define: {
    __BUILD_ID__: JSON.stringify(command === "build" ? buildId : "dev"),
  },
  plugins: [versionPlugin(command === "build")],
  server: {
    port: Number(process.env.CLIENT_PORT) || 5173,
    strictPort: true,
    host: true, // allow a second player on the LAN to connect
  },
}));
