import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4187', viewport: {width:1440,height:900}, screenshot:'only-on-failure', trace:'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {} },
  webServer: {command:'npm run preview -- --port 4187 --strictPort', url:'http://127.0.0.1:4187', reuseExistingServer:!process.env.CI},
});
