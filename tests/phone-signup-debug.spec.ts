import { test, expect, Page } from '@playwright/test';

// Helper function to logout
async function logout(page: Page) {
  try {
    const logoutButton = page.getByRole('button', { name: 'Logout' });
    if (await logoutButton.isVisible({ timeout: 2000 })) {
      await logoutButton.click();
      await page.waitForTimeout(500);
      console.log('✅ Logged out');
    }
  } catch (error) {
    console.log('ℹ️  Not logged in, skipping logout');
  }
}

test.describe('Phone Signup Debug Tests', () => {

  test('Test different phone number formats during signup', async ({ page }) => {
    console.log('\n📞 Starting phone format signup test...\n');

    const phoneFormats = [
      { format: '(555) 123-4567', label: 'Standard format' },
      { format: '555-123-4567', label: 'Dash format' },
      { format: '5551234567', label: 'Plain digits' },
      { format: '+1 555 123 4567', label: 'International format' },
      { format: '555.123.4567', label: 'Dot format' },
    ];

    for (let i = 0; i < phoneFormats.length; i++) {
      const { format, label } = phoneFormats[i];
      const testEmail = `test${Date.now()}${i}@test.com`;
      const testPassword = 'testpass123';

      console.log(`\n📝 Test ${i + 1}/${phoneFormats.length}: ${label}`);
      console.log(`   Phone: ${format}`);
      console.log(`   Email: ${testEmail}`);

      try {
        // Go to home page
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(500);

        // Logout if needed
        await logout(page);

        // Click Create Account tab
        console.log('   👆 Clicking Create Account tab...');
        const createAccountTab = page.getByRole('button', { name: 'Create Account' });
        if (await createAccountTab.isVisible({ timeout: 3000 })) {
          await createAccountTab.click();
          await page.waitForTimeout(500);
          console.log('   ✅ Create Account tab clicked');
        } else {
          console.log('   ❌ Create Account tab not found!');
          continue;
        }

        // Fill email
        console.log('   ✍️  Filling email...');
        const emailInput = page.getByLabel('Email', { exact: true });
        if (await emailInput.isVisible({ timeout: 2000 })) {
          await emailInput.fill(testEmail);
          console.log('   ✅ Email filled');
        } else {
          console.log('   ❌ Email input not found!');
          continue;
        }

        // Fill password
        console.log('   ✍️  Filling password...');
        const passwordInput = page.getByLabel('Password', { exact: true });
        if (await passwordInput.isVisible({ timeout: 2000 })) {
          await passwordInput.fill(testPassword);
          console.log('   ✅ Password filled');
        } else {
          console.log('   ❌ Password input not found!');
          continue;
        }

        // Fill phone number
        console.log(`   ✍️  Filling phone: ${format}...`);
        const phoneInput = page.getByLabel('Phone Number', { exact: true });
        if (await phoneInput.isVisible({ timeout: 2000 })) {
          await phoneInput.fill(format);
          console.log('   ✅ Phone filled');
        } else {
          console.log('   ⚠️  Phone input not visible (might be optional)');
        }

        // Check SMS consent checkbox
        console.log('   ✍️  Looking for SMS consent checkbox...');
        const smsCheckbox = page.getByRole('checkbox', { name: /SMS medication reminders/i });
        if (await smsCheckbox.isVisible({ timeout: 2000 })) {
          await smsCheckbox.check();
          console.log('   ✅ SMS consent checked');
        } else {
          console.log('   ⚠️  SMS consent checkbox not visible');
        }

        // Click Sign Up button
        console.log('   👆 Clicking Sign Up button...');
        const signUpButton = page.locator('form').getByRole('button', { name: 'Sign Up' });
        if (await signUpButton.isVisible({ timeout: 2000 })) {
          await signUpButton.click();
          console.log('   ✅ Sign Up button clicked');

          // Wait for response
          console.log('   ⏳ Waiting for response (3 seconds)...');
          await page.waitForTimeout(3000);

          // Check for success or error
          const loggedInText = page.getByText('Logged in as:');
          const errorText = page.getByText(/error|invalid|failed/i);

          if (await loggedInText.isVisible({ timeout: 1000 })) {
            console.log('   ✅ SUCCESS: User signed up and logged in!');
          } else if (await errorText.isVisible({ timeout: 1000 })) {
            const errorMessage = await errorText.textContent();
            console.log(`   ⚠️  ERROR MESSAGE: ${errorMessage}`);
          } else {
            console.log('   ⚠️  UNKNOWN: No clear success or error message');
          }

        } else {
          console.log('   ❌ Sign Up button not found!');
        }

      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        await page.screenshot({ path: `phone-signup-error-${i}.png` });
      }
    }

    console.log('\n✅ Phone format signup test complete!\n');
  });

  test('Test SMS consent checkbox toggling', async ({ page }) => {
    console.log('\n🔘 Testing SMS consent checkbox toggling...\n');

    await page.goto('http://localhost:5173');
    await logout(page);

    // Click Create Account
    const createAccountTab = page.getByRole('button', { name: 'Create Account' });
    if (await createAccountTab.isVisible({ timeout: 3000 })) {
      await createAccountTab.click();
      await page.waitForTimeout(500);
      console.log('✅ On Create Account tab');
    } else {
      console.log('❌ Create Account tab not found');
      return;
    }

    // Find SMS checkbox
    const checkbox = page.getByRole('checkbox', { name: /SMS medication reminders/i });
    if (await checkbox.isVisible({ timeout: 3000 })) {
      console.log('✅ SMS consent checkbox found');

      // Toggle 10 times
      for (let i = 0; i < 10; i++) {
        await checkbox.click();
        const isChecked = await checkbox.isChecked();
        console.log(`   Toggle ${i + 1}/10: ${isChecked ? 'CHECKED' : 'UNCHECKED'}`);
        await page.waitForTimeout(100);
      }

      console.log('✅ Checkbox toggling complete');
    } else {
      console.log('❌ SMS consent checkbox not visible');
    }

    console.log('\n✅ SMS consent test complete!\n');
  });
});
