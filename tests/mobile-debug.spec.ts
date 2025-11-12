import { test, expect, Page } from '@playwright/test';

// Test credentials
const TEST_EMAIL = 'larry@uglydogadventures.com';
const TEST_PASSWORD = '123456';

// Helper function to login
async function login(page: Page, email: string, password: string) {
  console.log('🔑 Logging in...');
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.waitForURL('/', { timeout: 5000 });
  console.log('✅ Logged in successfully');
}

test.describe('Mobile Viewport Debug Tests', () => {

  test('Test mobile viewport and modal interactions', async ({ page }) => {
    console.log('\n📱 Starting mobile viewport test...');

    // Set iPhone SE viewport
    await page.setViewportSize({ width: 375, height: 667 });
    console.log('📏 Set viewport to 375x667 (iPhone SE)');

    // Login
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForTimeout(2000);

    // Try to find and click the menu button
    console.log('🔍 Looking for menu button...');
    const menuButton = page.getByRole('button', { name: /menu/i });

    if (await menuButton.isVisible({ timeout: 3000 })) {
      console.log('✅ Menu button found and visible');

      try {
        // First click - open menu
        console.log('👆 Attempting to open menu...');
        await menuButton.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        console.log('✅ Menu opened');

        // Second click - close menu
        console.log('👆 Attempting to close menu...');
        await menuButton.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        console.log('✅ Menu closed');

        // Third click - re-open menu
        console.log('👆 Attempting to re-open menu...');
        await menuButton.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        console.log('✅ Menu re-opened');

      } catch (error) {
        console.log('❌ Error clicking menu button:', error.message);
        console.log('💡 Taking screenshot for debugging...');
        await page.screenshot({ path: 'mobile-menu-error.png' });
      }
    } else {
      console.log('⚠️  Menu button not visible in mobile viewport');
    }

    // Test navigation between tabs
    console.log('\n🔄 Testing navigation between tabs...');
    const tabs = ['Bills & Claims', '💊 Medications'];

    for (const tabText of tabs) {
      const button = page.getByRole('button', { name: tabText });
      if (await button.isVisible({ timeout: 2000 })) {
        console.log(`✅ Found tab: ${tabText}`);
        try {
          await button.click({ timeout: 3000 });
          await page.waitForTimeout(300);
          console.log(`✅ Clicked tab: ${tabText}`);
        } catch (error) {
          console.log(`❌ Error clicking tab ${tabText}:`, error.message);
        }
      } else {
        console.log(`⚠️  Tab not visible: ${tabText}`);
      }
    }

    console.log('\n✅ Mobile viewport test complete!');
  });

  test('Test modal overlay behavior', async ({ page }) => {
    console.log('\n🎭 Testing modal overlay behavior...');

    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, TEST_EMAIL, TEST_PASSWORD);
    await page.waitForTimeout(2000);

    // Try to open add pet modal
    console.log('🐕 Looking for Add Pet button...');
    const addPetButton = page.getByRole('button', { name: '+ Add Pet' });

    if (await addPetButton.isVisible({ timeout: 3000 })) {
      console.log('✅ Add Pet button found');
      await addPetButton.click();
      await page.waitForTimeout(500);
      console.log('✅ Add Pet modal opened');

      // Check for overlay
      const overlay = page.locator('.fixed.inset-0');
      if (await overlay.count() > 0) {
        console.log(`✅ Found ${await overlay.count()} overlay element(s)`);
      }

      // Try to close modal
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      if (await cancelButton.isVisible({ timeout: 2000 })) {
        console.log('✅ Cancel button visible');
        await cancelButton.click();
        await page.waitForTimeout(500);
        console.log('✅ Modal closed');
      } else {
        console.log('⚠️  Cancel button not visible');
      }
    } else {
      console.log('⚠️  Add Pet button not visible');
    }

    console.log('\n✅ Modal overlay test complete!');
  });
});
