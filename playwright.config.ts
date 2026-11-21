import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config cho tea-party-two-players
 * - Client (Vite): http://localhost:5173
 * - `npm run dev` chạy cả server + client qua concurrently
 * - Kết quả test ghi ra test-results/results.json để agent đọc
 */
export default defineConfig({
  testDir: './tests',

  /* Game 2 người chơi thường giữ state (phòng, lượt chơi...) trên server.
     Chạy tuần tự để các test không tranh nhau state. Khi test đã ổn định
     và mỗi test tự tạo phòng riêng, có thể bật lại parallel. */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  /* 'list' để đọc trong terminal, 'json' để agent đọc khi test fail */
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /* Chỉ chạy Chromium trong giai đoạn phát triển cho nhanh */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Tự bật server + client trước khi test.
     Nếu đã chạy `npm run dev` sẵn ở terminal khác thì dùng lại, không bật thêm. */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
