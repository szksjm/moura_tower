import { test, expect } from '@playwright/test';

test('起動して1ピース積める', async ({ page, context }) => {
  await page.goto('http://localhost:5173/index.html');
  await page.waitForSelector('#game-root');
  await page.keyboard.press('Space'); // 落下など操作に合わせて変更
  await expect(page.locator('#score')).toHaveText(/^[0-9]+$/);
});

test('オフライン起動', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto('http://localhost:5173/index.html');
  await page.waitForSelector('#game-root');
});
