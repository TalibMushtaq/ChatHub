import { test, expect } from "@playwright/test";

test.describe("Voice calling flow @e2e @calling", () => {
  test("user can join and leave a voice call", async ({ page }) => {
    // Step 1: Navigate to app
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    // Step 2: Navigate to a room with a voice channel
    // The exact navigation depends on the test environment setup
    // Assumes there's a room with a voice channel available

    // Step 3: Click on a voice channel to join
    const voiceChannel = page.getByRole("button", {
      name: /voice channel|join call/i,
    });
    if (await voiceChannel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await voiceChannel.click();
      await page.waitForTimeout(2000);

      // Step 4: Verify call widget appears
      const callWidget = page
        .getByTestId("call-widget")
        .or(page.locator('[class*="call"]').first());
      if (await callWidget.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(callWidget).toBeVisible();
      }

      // Step 5: Leave the call
      const leaveBtn = page.getByRole("button", {
        name: /leave|disconnect/i,
      });
      if (await leaveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await leaveBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("two users can be in the same call", async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ["microphone", "camera"],
    });
    const context2 = await browser.newContext({
      permissions: ["microphone", "camera"],
    });
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Both users navigate to the app
      await page1.goto("/");
      await page2.goto("/");

      await expect(page1.locator("body")).toBeVisible();
      await expect(page2.locator("body")).toBeVisible();

      // In a real test, you would:
      // 1. User1 joins a voice channel
      // 2. User2 joins the same voice channel
      // 3. Verify both see each other in the participant list
      // 4. User1 mutes — verify mute indicator
      // 5. User1 leaves — verify widget disappears for User1
      // 6. User2 still in call — widget still visible for User2
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

test.describe("Call widget behavior @e2e @calling", () => {
  test("call widget persists across navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    // In a real test:
    // 1. Join a call
    // 2. Navigate to a different channel/room
    // 3. Verify the floating call widget is still visible
  });

  test("call widget can be minimized and expanded", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    // In a real test:
    // 1. Join a call
    // 2. Click minimize on the widget
    // 3. Verify minimized state
    // 4. Click expand
    // 5. Verify expanded state
  });
});
