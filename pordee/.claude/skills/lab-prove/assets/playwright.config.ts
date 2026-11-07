// ชุดทดสอบพอดีพอร์ต · 1 ชุด (shard) = เว็บของตัวเอง 1 คู่ · workers 1 ต่อชุด (TEST-PLAN 6.1 ข้อ 6)
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3300';
const OUT = process.env.PW_OUT ?? 'test-report/raw/local';

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0, // ข้อที่ timeout รันซ้ำ 1 ครั้งโดย scripts/run-shards.mjs (แผน 6.2 ให้ retry 1 · นับเป็น flaky)
  outputDir: `${OUT}/artifacts`,
  reporter: [['list'], ['json', { outputFile: `${OUT}/results.json` }]],
  use: {
    baseURL: BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    screenshot: 'off', // ภาพตอนตรวจ (กรอบแดง) แนบเองใน fixture
    trace: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    {
      name: 'mobile-chrome',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, video: { mode: 'on', size: { width: 375, height: 812 } } },
    },
  ],
});
