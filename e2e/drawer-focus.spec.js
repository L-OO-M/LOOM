const { test, expect } = require("@playwright/test");

// The shared Drawer is the app's only modal surface (inbox, node details,
// feature requests). It closed on Escape but never trapped Tab and never gave
// focus back to the opener, so a keyboard user could tab into the page behind
// the overlay and was left with focus lost after closing. This suite drives the
// real inbox drawer as an authenticated student and asserts both behaviours.
//
// Requires E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD in .env.local, like
// login.spec.js and student-audit.spec.js. Skips itself otherwise.

const EMAIL = process.env.E2E_LOGIN_EMAIL;
const PASSWORD = process.env.E2E_LOGIN_PASSWORD;
test.skip(!EMAIL || !PASSWORD, "set E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD to run the drawer focus test");

// Same budget as login.spec.js: /student is the heaviest route and pays a cold
// compile on a dev server shared with the rest of the suite.
test.describe.configure({ timeout: 120_000 });

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Same sign-in shape as login.spec.js: real form, real redirect.
async function signIn(page) {
  await page.goto("/login");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

// The bell's accessible name is "Inbox" or "Inbox, N unread" (AppShell.jsx).
function inboxBell(page) {
  return page.getByRole("button", { name: /^Inbox/ }).first();
}

// True when the currently focused node is inside the dialog.
async function focusIsInsideDialog(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return !!el && !!el.closest('[role="dialog"]');
  });
}

test("inbox drawer traps Tab and restores focus to the bell on Escape", async ({ page }) => {
  await signIn(page);
  await page.goto("/student", { waitUntil: "domcontentloaded" });

  const bell = inboxBell(page);
  await expect(bell).toBeVisible({ timeout: 20_000 });
  await bell.focus();
  await expect(bell).toBeFocused();

  await bell.click();

  const dialog = page.getByRole("dialog", { name: /Inbox/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const closeButton = dialog.getByRole("button", { name: "Close panel" });
  // Initial focus still lands on the close button (autoFocus is untouched).
  await expect(closeButton).toBeFocused();

  // Explicit wrap points: first -> Shift+Tab -> last, last -> Tab -> first.
  const focusables = dialog.locator(FOCUSABLE);
  const first = focusables.first();
  const last = focusables.last();
  await expect(first).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();

  // And in both directions, repeated Tab never leaves the panel.
  for (let i = 1; i <= 12; i += 1) {
    await page.keyboard.press("Tab");
    expect(await focusIsInsideDialog(page), `Tab #${i} moved focus outside the drawer`).toBe(true);
  }
  for (let i = 1; i <= 12; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusIsInsideDialog(page), `Shift+Tab #${i} moved focus outside the drawer`).toBe(true);
  }

  // Escape still closes, and focus goes back to the element that opened it.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  await expect(bell).toBeFocused();

  // The body scroll lock is released with it.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
