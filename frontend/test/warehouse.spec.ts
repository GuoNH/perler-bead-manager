import { expect, test } from "@playwright/test";

test("inventory view renders", async ({ page }) => {
  await page.goto("http://localhost:5173/inventory");
  await expect(page.getByRole("heading", { name: "仓库台账" })).toBeVisible();
});
