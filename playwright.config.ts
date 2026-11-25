import { defineConfig, devices } from '@playwright/test';
import {
  TEST_CLIENT_PORT,
  TEST_CLIENT_URL,
  TEST_SERVER_PORT,
  TEST_SERVER_URL,
} from './tests/ports';

/**
 * Playwright config cho tea-party-two-players
 * - Server (Colyseus + Express): http://localhost:2568, health check tại /health
 * - Client (Vite + Phaser):       http://localhost:5174
 * - Cổng riêng, không dùng lại dev server 2567/5173 của người dùng.
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
    baseURL: TEST_CLIENT_URL,
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

  /* Bật server test rồi client test trên cổng riêng (2568/5174).
     Không dùng lại dev server của người dùng (2567/5173). */
  webServer: [
    {
      command: 'npm run dev:server',
      url: `${TEST_SERVER_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      /* The admin API + /portal only exist when ADMIN_TOKEN is set; the admin-portal spec relies on it.
         Spread process.env (Playwright replaces the whole environment, which would drop PATH). */
      env: { ...process.env, ADMIN_TOKEN: 'test-admin-token', PORT: String(TEST_SERVER_PORT) },
    },
    {
      command: 'npm run dev:client',
      url: TEST_CLIENT_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        CLIENT_PORT: String(TEST_CLIENT_PORT),
        VITE_SERVER_URL: TEST_SERVER_URL,
      },
    },
  ],
});
