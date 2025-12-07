import { test, expect } from '@playwright/test';

test.describe('Play Page - Initial Load', () => {
    test('should redirect to setup if no config in session', async ({ page }) => {
        await page.goto('/play');
        await page.waitForURL('/');
    });
});

test.describe('Play Page - With Mock Config', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => {
            const mockConfig = {
                folderName: 'test-campaign',
                parts: [{
                    id: '1',
                    name: 'Act 1',
                    planFile: { path: 'plan/act1/intro.md', name: 'intro.md', type: 'markdown' },
                    images: [],
                    supportDocs: [],
                    bgmPlaylist: [],
                    eventPlaylists: []
                }],
                playerCharacters: ['Aragorn', 'Legolas'],
                pcStats: []
            };
            sessionStorage.setItem('campaignConfig', JSON.stringify(mockConfig));
            sessionStorage.setItem('folderSelected', 'true');
        });
        await page.goto('/play');
    });

    test('should show folder selection prompt', async ({ page }) => {
        await expect(page.getByText('Select Campaign Folder')).toBeVisible();
    });

    test('should display session configuration info', async ({ page }) => {
        await expect(page.getByText('Session Configuration Loaded:')).toBeVisible();
        await expect(page.getByText('test-campaign')).toBeVisible();
        await expect(page.getByText(/1 part configured/i)).toBeVisible();
    });

    test('should have select folder button', async ({ page }) => {
        const selectBtn = page.getByRole('button', { name: /select folder/i });
        await expect(selectBtn).toBeVisible();
        await expect(selectBtn).toBeEnabled();
    });

    test('should have cancel button to go back', async ({ page }) => {
        const cancelBtn = page.getByRole('button', { name: /cancel/i });
        await expect(cancelBtn).toBeVisible();
        await cancelBtn.click();
        await page.waitForURL('/');
    });
});

test.describe('Play Page - Multi-part Config', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => {
            const mockConfig = {
                folderName: 'multi-part-campaign',
                parts: [
                    {
                        id: '1',
                        name: 'Act 1 - Introduction',
                        planFile: { path: 'plan/act1/intro.md', name: 'intro.md', type: 'markdown' },
                        images: [{ path: 'images/act1/scene.png', name: 'scene.png', type: 'image' }],
                        supportDocs: [{ path: 'characters/act1/npc.md', name: 'npc.md', type: 'markdown' }],
                        bgmPlaylist: [],
                        eventPlaylists: []
                    },
                    {
                        id: '2',
                        name: 'Act 2 - Rising Action',
                        planFile: { path: 'plan/act2/combat.md', name: 'combat.md', type: 'markdown' },
                        images: [],
                        supportDocs: [],
                        bgmPlaylist: [],
                        eventPlaylists: [{ id: 'e1', name: 'Combat Music', tracks: [] }]
                    },
                    {
                        id: '3',
                        name: 'Act 3 - Finale',
                        planFile: null,
                        images: [],
                        supportDocs: [],
                        bgmPlaylist: [],
                        eventPlaylists: []
                    }
                ],
                playerCharacters: ['Fighter', 'Wizard', 'Rogue', 'Cleric'],
                pcStats: [
                    { name: 'Fighter', maxHP: 45, defense: 18 },
                    { name: 'Wizard', maxHP: 20, defense: 12 }
                ]
            };
            sessionStorage.setItem('campaignConfig', JSON.stringify(mockConfig));
            sessionStorage.setItem('folderSelected', 'true');
        });
        await page.goto('/play');
    });

    test('should show correct part count', async ({ page }) => {
        await expect(page.getByText(/3 parts configured/i)).toBeVisible();
    });

    test('should display folder name', async ({ page }) => {
        await expect(page.getByText('multi-part-campaign')).toBeVisible();
    });
});

test.describe('Play Page - Accessibility', () => {
    test('should have proper heading structure on setup page', async ({ page }) => {
        await page.goto('/');
        const h1 = page.locator('h1');
        await expect(h1).toHaveCount(1);
        await expect(h1).toContainText('TTRPG Session Manager');
    });

    test('should have accessible buttons', async ({ page }) => {
        await page.goto('/');
        const buttons = page.locator('button:visible');
        const count = await buttons.count();
        expect(count).toBeGreaterThan(0);
    });
});
