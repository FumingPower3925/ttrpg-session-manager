import { test, expect } from '@playwright/test';

test.describe('Setup Page - Core UI', () => {
    test('should load and display page title', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/TTRPG Session Manager/);
        await expect(page.locator('h1')).toContainText('TTRPG Session Manager');
    });

    test('should display page description', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(/Configure your tabletop RPG sessions/i)).toBeVisible();
    });
});

test.describe('Setup Page - Folder Selection', () => {
    test('should display campaign folder card', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Campaign Folder')).toBeVisible();
        await expect(page.getByText(/Select the folder containing your campaign materials/i)).toBeVisible();
    });

    test('should have select folder button', async ({ page }) => {
        await page.goto('/');
        const selectButton = page.getByRole('button', { name: /select folder/i });
        await expect(selectButton).toBeVisible();
        await expect(selectButton).toBeEnabled();
    });
});

test.describe('Setup Page - Configuration Section', () => {
    test('should display configuration card title', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('text=Configuration').first()).toBeVisible();
    });

    test('should have auto-detect button disabled without folder', async ({ page }) => {
        await page.goto('/');
        const autoDetectBtn = page.getByRole('button', { name: /auto-detect/i });
        await expect(autoDetectBtn).toBeVisible();
        await expect(autoDetectBtn).toBeDisabled();
    });

    test('should have import config button enabled', async ({ page }) => {
        await page.goto('/');
        const importBtn = page.getByRole('button', { name: /import config/i });
        await expect(importBtn).toBeVisible();
        await expect(importBtn).toBeEnabled();
    });

    test('should have export config button disabled without folder', async ({ page }) => {
        await page.goto('/');
        const exportBtn = page.getByRole('button', { name: /export config/i });
        await expect(exportBtn).toBeVisible();
        await expect(exportBtn).toBeDisabled();
    });

    test('should have help button for folder structure', async ({ page }) => {
        await page.goto('/');
        const helpButton = page.locator('button[title="View expected folder structure"]');
        await expect(helpButton).toBeVisible();
    });

    test('should open folder structure dialog when help is clicked', async ({ page }) => {
        await page.goto('/');
        const helpButton = page.locator('button[title="View expected folder structure"]');
        await helpButton.click();
        await expect(page.getByText('Expected Folder Structure')).toBeVisible();
        await expect(page.getByText(/Organize your session folder/i)).toBeVisible();
    });

    test('should show folder structure preview in dialog', async ({ page }) => {
        await page.goto('/');
        const helpButton = page.locator('button[title="View expected folder structure"]');
        await helpButton.click();
        await expect(page.getByText(/session-folder/)).toBeVisible();
    });

    test('should show supported file formats in dialog', async ({ page }) => {
        await page.goto('/');
        const helpButton = page.locator('button[title="View expected folder structure"]');
        await helpButton.click();
        await expect(page.getByText('Supported Image Formats:')).toBeVisible();
        await expect(page.getByText('Supported Audio Formats:')).toBeVisible();
    });

    test('should close dialog when clicking outside', async ({ page }) => {
        await page.goto('/');
        const helpButton = page.locator('button[title="View expected folder structure"]');
        await helpButton.click();
        await expect(page.getByText('Expected Folder Structure')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByText('Expected Folder Structure')).not.toBeVisible();
    });
});

test.describe('Setup Page - Player Characters Section', () => {
    test('should display player characters card', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Player Characters')).toBeVisible();
        await expect(page.getByText(/Add PC names for initiative tracking/i)).toBeVisible();
    });

    test('should have PC name input', async ({ page }) => {
        await page.goto('/');
        const input = page.getByPlaceholder(/Enter PC name/i);
        await expect(input).toBeVisible();
        await expect(input).toBeEnabled();
    });

    test('should have add PC button', async ({ page }) => {
        await page.goto('/');
        const addBtn = page.locator('button').filter({ hasText: 'Add' }).first();
        await expect(addBtn).toBeVisible();
    });

    test('should show empty state when no PCs added', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(/No PCs added yet/i)).toBeVisible();
    });
});

test.describe('Setup Page - Campaign Parts Section', () => {
    test('should display campaign parts card', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Campaign Parts')).toBeVisible();
        await expect(page.getByText(/Configure each part of your campaign session/i)).toBeVisible();
    });

    test('should have add part button disabled without folder', async ({ page }) => {
        await page.goto('/');
        const addPartBtn = page.getByRole('button', { name: /add part/i });
        await expect(addPartBtn).toBeVisible();
        await expect(addPartBtn).toBeDisabled();
    });

    test('should show empty state when no parts added', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(/No parts added yet/i)).toBeVisible();
    });
});

test.describe('Setup Page - Start Session', () => {
    test('should have start session button disabled without config', async ({ page }) => {
        await page.goto('/');
        const startBtn = page.getByRole('button', { name: /start session/i });
        await expect(startBtn).toBeVisible();
        await expect(startBtn).toBeDisabled();
    });
});

test.describe('Setup Page - Browser Compatibility', () => {
    test('should skip browser compatibility warning on Chromium', async ({ page, browserName }) => {
        test.skip(browserName === 'chromium', 'Skip on Chromium - feature is supported');
        await page.goto('/');
        await expect(page.getByText(/Browser Not Supported/i)).toBeVisible();
    });
});
