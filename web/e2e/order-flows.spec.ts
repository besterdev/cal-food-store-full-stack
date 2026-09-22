import { expect, test } from "@playwright/test";

import {
  apiBaseURL,
  captureEvidence,
  ensureRedWindowBlocked,
  expectAcceptedOrder,
  expectFinalTotal,
  expectNoAxeViolations,
  formatSatangLabel,
  increaseQuantity,
  waitForCatalog,
} from "./helpers";

test.describe("Food Store calculator flows", () => {
  test("Flow A: places a normal Order and resets with New Order", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await waitForCatalog(page);
    await expectNoAxeViolations(page);

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to calculator" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await increaseQuantity(page, "Blue set", 2);
    if (testInfo.project.name === "desktop") {
      await captureEvidence(page, "desktop-editing.png");
    } else {
      await captureEvidence(page, "mobile-editing.png");
    }

    await page.getByRole("button", { name: "Calculate & Place Order" }).click();
    await expect(
      page.getByRole("heading", { name: "Pricing Breakdown" }),
    ).toBeFocused();
    await expectAcceptedOrder(page);
    await expectFinalTotal(page, 6000);
    await expectNoAxeViolations(page);

    if (testInfo.project.name === "desktop") {
      await captureEvidence(page, "desktop-receipt-blue.png");
    } else {
      await captureEvidence(page, "mobile-receipt-blue.png");
    }

    await page.getByRole("button", { name: "New Order" }).click();
    await expect(
      page.getByRole("button", { name: "Increase Red set quantity" }),
    ).toBeFocused();
    await expect(
      page.getByRole("status", { name: "Blue set quantity" }),
    ).toHaveText("0");
  });

  test("Flow B: combined Pair and Member Discounts", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await waitForCatalog(page);

    await increaseQuantity(page, "Orange set", 3);
    await increaseQuantity(page, "Pink set", 2);
    await increaseQuantity(page, "Green set", 1);
    await increaseQuantity(page, "Blue set", 2);
    await page
      .getByLabel("Member Card number (optional)")
      .fill("  MEMBER-42  ");

    await page.getByRole("button", { name: "Calculate & Place Order" }).click();

    await expectAcceptedOrder(page);
    await expect(
      page.getByText(formatSatangLabel(62000), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`−${formatSatangLabel(2000)}`, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(`−${formatSatangLabel(6000)}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("span.text-2xl").filter({
        hasText: formatSatangLabel(54000),
      }),
    ).toBeVisible();
    await expect(page.getByText("MEMBER-42")).toHaveCount(0);
    await expectNoAxeViolations(page);

    if (testInfo.project.name === "desktop") {
      await captureEvidence(page, "desktop-receipt.png");
    } else {
      await captureEvidence(page, "mobile-receipt.png");
    }
  });

  test("Flow C: Red conflict recovery", async ({ page, request }, testInfo) => {
    await ensureRedWindowBlocked(
      request,
      `e2e-red-seed-${testInfo.project.name}-${Date.now()}`,
    );

    await page.goto("/");
    await waitForCatalog(page);
    await increaseQuantity(page, "Red set", 1);
    await increaseQuantity(page, "Blue set", 1);
    await page.getByRole("button", { name: "Calculate & Place Order" }).click();

    await expect(
      page.getByText("Red is temporarily unavailable"),
    ).toBeVisible();
    await expect(page.getByText(/available again at/i)).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Red set quantity" }),
    ).toHaveText("1");
    await expect(
      page.getByRole("status", { name: "Blue set quantity" }),
    ).toHaveText("1");
    await expectNoAxeViolations(page);

    if (testInfo.project.name === "desktop") {
      await captureEvidence(page, "desktop-red-conflict.png");
    } else {
      await captureEvidence(page, "mobile-red-conflict.png");
    }

    await page.getByRole("button", { name: "Remove Red" }).click();
    await expect(
      page.getByRole("status", { name: "Red set quantity" }),
    ).toHaveText("0");
    await page.getByRole("button", { name: "Calculate & Place Order" }).click();
    await expectAcceptedOrder(page);
    await expectFinalTotal(page, 3000);
  });

  test("Flow D: interrupted response reuses the same idempotency key", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForCatalog(page);
    await increaseQuantity(page, "Yellow set", 1);

    let seenKey: string | undefined;
    let attempt = 0;

    await page.route("**/api/v1/orders", async (route) => {
      attempt += 1;
      const key = route.request().headers()["idempotency-key"];
      if (attempt === 1) {
        seenKey = key;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: "SERVICE_UNAVAILABLE",
            message: "The Order service is temporarily unavailable.",
            request_id: "e2e-timeout",
          }),
        });
        return;
      }
      expect(key).toBe(seenKey);
      await route.continue();
    });

    await page.getByRole("button", { name: "Calculate & Place Order" }).click();
    await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
    await page.getByRole("button", { name: "Retry order" }).click();
    await expectAcceptedOrder(page);
    expect(attempt).toBe(2);
  });

  test("keyboard empty-submit focuses the validation alert", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForCatalog(page);
    await page.getByRole("button", { name: "Calculate & Place Order" }).click();
    await expect(
      page.getByText("Add at least one Product before placing the Order."),
    ).toBeFocused();
  });
});

test("API readiness is required for the suite", async ({ request }) => {
  const response = await request.get(`${apiBaseURL}/health/ready`);
  expect(response.ok()).toBeTruthy();
});
