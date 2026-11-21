import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config cho tea-party-two-players
 * - Server (Colyseus + Express): http://localhost:2567, health check tại /health
 * - Client (Vite + Phaser):       http://localhost:5173
 * - Kết quả test ghi ra test-results/results.json để agent đọc khi fail
 */
export default defineConfig({
  testDir: './tests',

  /* Server giữ state phòng (max 2 player/phòng) và shop theo username.
     Chạy tuần tự để các test không tranh phòng/state của nhau. */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  /* Game realtime qua WebSocket: cho mỗi test thêm thời gian */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* 'list' để đọc trong terminal, 'json' để agent đọc khi test fail */
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /* Khớp kích thước world 960x600 của game, chừa chỗ cho DOM overlay */
    viewport: { width: 1280, height: 800 },
  },

  /* Chỉ Chromium trong giai đoạn phát triển */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],

  /* Bật server trước, chờ /health OK, rồi mới bật client.
     Nếu đã chạy `npm run dev` sẵn thì dùng lại, không bật thêm. */
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:2567/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
