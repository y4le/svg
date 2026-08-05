import { expect, test } from "@playwright/test";

test("opens the code-forward workbench shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "source" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "preview" })).toBeVisible();
  await expect(page.getByText("untitled.svg")).toBeVisible();
  await expect(page.getByText("scripts disabled")).toBeVisible();
  expect(errors).toEqual([]);
});
