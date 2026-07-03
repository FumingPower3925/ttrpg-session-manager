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

// Installs a fake File System Access API so the play page can get past the folder-selection
// gate in headless CI. Every file resolves to simple markdown content.
async function stubFileSystemAccess(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        const makeFileHandle = (name: string) => ({
            kind: 'file',
            name,
            async getFile() {
                return {
                    name,
                    async text() { return `# ${name}\n\nStub content for ${name}.`; },
                };
            },
        });
        const makeDirHandle = (name: string): any => ({
            kind: 'directory',
            name,
            async getDirectoryHandle(child: string) { return makeDirHandle(child); },
            async getFileHandle(child: string) { return makeFileHandle(child); },
            async resolve() { return []; },
        });
        (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
            async () => makeDirHandle('stub-folder');
    });
}

// Helper: inject a config into sessionStorage, then drive past the folder gate.
async function enterPlayMode(page: import('@playwright/test').Page, config: object) {
    await stubFileSystemAccess(page);
    await page.goto('/');
    await page.evaluate((cfg) => {
        sessionStorage.setItem('campaignConfig', JSON.stringify(cfg));
        sessionStorage.setItem('folderSelected', 'true');
    }, config);
    await page.goto('/play');
    await page.getByRole('button', { name: /select folder/i }).click();
}

test.describe('Play Page - Backward Compatibility (no paths)', () => {
    const LEGACY_CONFIG = {
        folderName: 'legacy-campaign',
        parts: [
            { id: '1', name: 'Act 1', planFile: { path: 'a1.md', name: 'a1.md', type: 'markdown' }, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [] },
            { id: '2', name: 'Act 2', planFile: { path: 'a2.md', name: 'a2.md', type: 'markdown' }, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [] },
        ],
        playerCharacters: [],
        pcStats: [],
        // No `paths`, no `activePathId` - exactly an old config.
    };

    test('should load and play a config with no paths linearly', async ({ page }) => {
        await enterPlayMode(page, LEGACY_CONFIG);

        // The part navigation dropdown lists all (trunk) parts; no path switcher appears.
        const navTrigger = page.getByRole('button', { name: /Act 1/ });
        await expect(navTrigger).toBeVisible();
        await navTrigger.click();
        await expect(page.getByRole('menuitem', { name: 'Act 1' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Act 2' })).toBeVisible();
        await page.keyboard.press('Escape');

        // No path switcher for a config without paths.
        await expect(page.getByRole('button', { name: /No path/i })).toHaveCount(0);
    });
});

test.describe('Play Page - Branching Paths', () => {
    const BRANCHED_CONFIG = {
        folderName: 'branched-campaign',
        parts: [
            { id: '1', name: 'Act 1 - Setup', planFile: { path: 'a1.md', name: 'a1.md', type: 'markdown' }, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [] },
            { id: '2', name: 'Act 2 - Fork', planFile: { path: 'a2.md', name: 'a2.md', type: 'markdown' }, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [] },
            { id: '3', name: 'Sneak In', planFile: { path: 'sneak.md', name: 'sneak.md', type: 'markdown' }, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [], pathId: 'path-sneak' },
            { id: '4', name: 'Fight Through', planFile: { path: 'fight.md', name: 'fight.md', type: 'markdown' }, images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [], pathId: 'path-fight' },
        ],
        playerCharacters: [],
        pcStats: [],
        paths: [
            { id: 'path-sneak', name: 'Sneak In', branchAfterPartId: '2' },
            { id: 'path-fight', name: 'Fight Through', branchAfterPartId: '2' },
        ],
        activePathId: null,
    };

    test('should show only trunk parts while no path is active', async ({ page }) => {
        await enterPlayMode(page, BRANCHED_CONFIG);

        // The path switcher is present (config has paths) and defaults to "No path".
        await expect(page.getByRole('button', { name: /No path/i })).toBeVisible();

        // The part dropdown lists only trunk parts (no path-only parts).
        await page.getByRole('button', { name: /Act 1 - Setup/ }).click();
        await expect(page.getByRole('menuitem', { name: 'Act 1 - Setup' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Act 2 - Fork' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Sneak In' })).toHaveCount(0);
        await expect(page.getByRole('menuitem', { name: 'Fight Through' })).toHaveCount(0);
        await page.keyboard.press('Escape');
    });

    test('should filter visibleParts to trunk + chosen path via the path switcher', async ({ page }) => {
        await enterPlayMode(page, BRANCHED_CONFIG);

        // Choose "Sneak In" from the path switcher.
        await page.getByRole('button', { name: /No path/i }).click();
        await page.getByRole('menuitem', { name: 'Sneak In' }).click();

        // The switcher reflects the active path.
        await expect(page.getByRole('button', { name: /Sneak In/ })).toBeVisible();

        // The part dropdown now shows trunk + Sneak In, but NOT Fight Through.
        await page.getByRole('button', { name: /Act 1 - Setup/ }).click();
        await expect(page.getByRole('menuitem', { name: 'Act 2 - Fork' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Sneak In' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Fight Through' })).toHaveCount(0);
        await page.keyboard.press('Escape');
    });

    test('should reset the active path back to trunk-only via the path switcher', async ({ page }) => {
        await enterPlayMode(page, BRANCHED_CONFIG);

        // Activate a path...
        await page.getByRole('button', { name: /No path/i }).click();
        await page.getByRole('menuitem', { name: 'Fight Through' }).click();
        await expect(page.getByRole('button', { name: /Fight Through/ })).toBeVisible();

        // ...then reset it back to trunk-only.
        await page.getByRole('button', { name: /Fight Through/ }).click();
        await page.getByRole('menuitem', { name: /No path \(trunk only\)/i }).click();
        await expect(page.getByRole('button', { name: /No path/i })).toBeVisible();

        // The part dropdown no longer lists path parts.
        await page.getByRole('button', { name: /Act 1 - Setup/ }).click();
        await expect(page.getByRole('menuitem', { name: 'Sneak In' })).toHaveCount(0);
        await expect(page.getByRole('menuitem', { name: 'Fight Through' })).toHaveCount(0);
        await page.keyboard.press('Escape');
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
