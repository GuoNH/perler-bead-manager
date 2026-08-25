import { expect, test } from "@playwright/test";

test("upload view renders", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await expect(page.getByText(/点击或拖拽上传拼豆图纸/)).toBeVisible();
});
