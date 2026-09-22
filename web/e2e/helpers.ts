import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const apiBaseURL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8080";

export const screenshotDir = path.join(
  process.cwd(),
  "..",
  "docs",
  "verification",
  "screenshots",
);

const axeTags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
] as const;

export const expectNoAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags([...axeTags])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
};

export const waitForCatalog = async (page: Page) => {
  await expect(
    page.getByRole("heading", { name: "Choose Products" }),
  ).toBeVisible();
  await expect(page.getByText("Red set")).toBeVisible();
  await expect(page.getByText("Orange set")).toBeVisible();
};

export const increaseQuantity = async (
  page: Page,
  productName: string,
  times = 1,
) => {
  const button = page.getByRole("button", {
    name: `Increase ${productName} quantity`,
  });
  for (let index = 0; index < times; index += 1) {
    await button.click();
  }
};

export const expectAcceptedOrder = async (page: Page) => {
  await expect(page.getByText(/^Order [0-9a-f-]{36}$/i)).toBeVisible();
};

export const expectFinalTotal = async (page: Page, satang: number) => {
  await expect(
    page.locator("span.text-2xl").filter({
      hasText: formatSatangLabel(satang),
    }),
  ).toBeVisible();
};

export const ensureRedWindowBlocked = async (
  request: APIRequestContext,
  key: string,
) => {
  const response = await request.post(`${apiBaseURL}/api/v1/orders`, {
    data: {
      lines: [{ product_code: "RED", quantity: 1 }],
    },
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
  });
  if (response.ok() || response.status() === 409) {
    return;
  }
  expect(response.ok(), await response.text()).toBeTruthy();
};

export const captureEvidence = async (page: Page, filename: string) => {
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, filename),
    fullPage: true,
  });
};

export const formatSatangLabel = (satang: number) =>
  new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(satang / 100);
