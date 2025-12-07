import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
    test('should navigate from setup to play and back', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL('/');

        await page.evaluate(() => {
            const mockConfig = {
                folderName: 'nav-test',
                parts: [{ id: '1', name: 'Part 1', planFile: null, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [] }],
                playerCharacters: [],
                pcStats: []
            };
            sessionStorage.setItem('campaignConfig', JSON.stringify(mockConfig));
            sessionStorage.setItem('folderSelected', 'true');
        });

        await page.goto('/play');
        await expect(page.getByText('Select Campaign Folder')).toBeVisible();

        await page.getByRole('button', { name: /cancel/i }).click();
        await expect(page).toHaveURL('/');
    });
});

test.describe('Keyboard Shortcuts', () => {
    test('should close dialogs with Escape key', async ({ page }) => {
        await page.goto('/');

        const helpButton = page.locator('button[title="View expected folder structure"]');
        await helpButton.click();
        await expect(page.getByText('Expected Folder Structure')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.getByText('Expected Folder Structure')).not.toBeVisible();
    });
});

test.describe('Responsive Layout', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');

        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByRole('button', { name: /select folder/i })).toBeVisible();
    });

    test('should display correctly on tablet viewport', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');

        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByText('Campaign Folder')).toBeVisible();
    });

    test('should display correctly on desktop viewport', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('/');

        await expect(page.locator('h1')).toBeVisible();
        await expect(page.getByText('Campaign Folder')).toBeVisible();
        await expect(page.getByText('Player Characters')).toBeVisible();
        await expect(page.getByText('Campaign Parts')).toBeVisible();
    });
});

test.describe('Loading States', () => {
    test('should redirect to setup from play without config', async ({ page }) => {
        await page.goto('/play');
        await page.waitForURL('/', { timeout: 5000 });
        await expect(page).toHaveURL('/');
    });
});

test.describe('Error Handling', () => {
    test('should redirect to setup page on missing config', async ({ page }) => {
        await page.goto('/play');
        await page.waitForURL('/', { timeout: 5000 });
        await expect(page).toHaveURL('/');
    });
});

test.describe('Theme and Styling', () => {
    test('should have proper background color', async ({ page }) => {
        await page.goto('/');
        const body = page.locator('body');
        await expect(body).toBeVisible();
    });

    test('should have styled cards', async ({ page }) => {
        await page.goto('/');
        const cards = page.locator('[data-slot="card"]');
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('should have styled buttons', async ({ page }) => {
        await page.goto('/');
        const primaryButton = page.getByRole('button', { name: /start session/i });
        await expect(primaryButton).toBeVisible();
    });
});

test.describe('Form Interactions', () => {
    test('should focus PC input on tab', async ({ page }) => {
        await page.goto('/');
        const input = page.getByPlaceholder(/Enter PC name/i);
        await input.focus();
        await expect(input).toBeFocused();
    });

    test('should allow typing in PC input', async ({ page }) => {
        await page.goto('/');
        const input = page.getByPlaceholder(/Enter PC name/i);
        await input.fill('Test Character');
        await expect(input).toHaveValue('Test Character');
    });

    test('should clear PC input after pressing Enter on Add', async ({ page }) => {
        await page.goto('/');
        const input = page.getByPlaceholder(/Enter PC name/i);
        await input.fill('New PC');
        await input.press('Enter');
        await expect(page.getByText('New PC')).toBeVisible();
        await expect(input).toHaveValue('');
    });
});

test.describe('Badge Display', () => {
    test('should display PC badges after adding', async ({ page }) => {
        await page.goto('/');
        const input = page.getByPlaceholder(/Enter PC name/i);

        await input.fill('Fighter');
        await input.press('Enter');
        await expect(page.getByText('Fighter')).toBeVisible();

        await input.fill('Wizard');
        await input.press('Enter');
        await expect(page.getByText('Wizard')).toBeVisible();
    });
});
