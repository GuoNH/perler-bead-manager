import { expect, test } from "@playwright/test";

test("upload view renders", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await expect(page.getByText(/点击或拖拽上传拼豆图纸/)).toBeVisible();
});

test("adds a failed legend cell after manual entry", async ({ page }) => {
  await page.route("**/api/recognize", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        image: { name: "pattern.png", width: 1, height: 1 },
        legend: [{ id: "A1", rgb: { r: 1, g: 2, b: 3 }, count: 12 }],
        warnings: [],
        failedCells: [{
          row: 1,
          col: 2,
          rgb: { r: 4, g: 5, b: 6 },
          text: "G2O 50",
        }],
      }),
    });
  });

  await page.goto("http://localhost:5173");
  await page.locator('input[type="file"]').setInputFiles({
    name: "pattern.png",
    mimeType: "image/png",
    buffer: Buffer.from("test image"),
  });

  await expect(page.getByText("识别失败，请对照原图补录")).toBeVisible();
  await page.getByTestId("failed-id").fill("G20");
  await page.getByTestId("failed-count").fill("50");
  await page.getByTestId("failed-add").click();

  await expect(page.getByText("2 个色号")).toBeVisible();
  await expect(page.getByTestId("failed-add")).toHaveText("已补录");
});
