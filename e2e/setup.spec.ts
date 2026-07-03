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

test.describe('Setup Page - Branching Paths Section', () => {
    test('should display branching paths card', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Branching Paths')).toBeVisible();
        await expect(page.getByText(/Optionally fork the session into alternative paths/i)).toBeVisible();
    });

    test('should disable add-path controls until a part exists', async ({ page }) => {
        await page.goto('/');
        // No parts yet: prompt to add a part, and the input/button are disabled.
        await expect(page.getByText(/Add at least one part before creating paths/i)).toBeVisible();
        const pathInput = page.getByPlaceholder(/Path name/i);
        await expect(pathInput).toBeDisabled();
        const addPathBtn = page.getByRole('button', { name: /add path/i });
        await expect(addPathBtn).toBeDisabled();
    });
});

// A config that exercises branching: trunk parts + two paths, one part assigned to each path,
// plus a persisted activePathId. This is the exact shape exportConfig() serializes.
const BRANCHED_CONFIG = {
    folderName: 'branched-campaign',
    parts: [
        {
            id: '1', name: 'Act 1 - Setup',
            planFile: { path: 'plan/act1/intro.md', name: 'intro.md', type: 'markdown' },
            images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [],
        },
        {
            id: '2', name: 'Act 2 - Fork',
            planFile: { path: 'plan/act2/fork.md', name: 'fork.md', type: 'markdown' },
            images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [],
        },
        {
            id: '3', name: 'Sneak In',
            planFile: { path: 'plan/sneak/sneak.md', name: 'sneak.md', type: 'markdown' },
            images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [],
            pathId: 'path-sneak',
        },
        {
            id: '4', name: 'Fight Through',
            planFile: { path: 'plan/fight/fight.md', name: 'fight.md', type: 'markdown' },
            images: [], supportDocs: [], bgmPlaylist: [], eventPlaylists: [],
            pathId: 'path-fight',
        },
    ],
    playerCharacters: ['Rogue'],
    pcStats: [],
    paths: [
        { id: 'path-sneak', name: 'Sneak In', branchAfterPartId: '2' },
        { id: 'path-fight', name: 'Fight Through', branchAfterPartId: '2' },
    ],
    activePathId: null,
};

test.describe('Setup Page - Branched Config Import Round-trip', () => {
    test('should import a branched config and surface per-part path selectors', async ({ page }) => {
        await page.goto('/');

        // The import flow creates a dynamic <input type=file> and clicks it; intercept the chooser.
        page.on('dialog', (d) => d.accept()); // dismiss the "imported successfully" alert
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: /import config/i }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
            name: 'branched-config.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(BRANCHED_CONFIG)),
        });

        // Parts from the imported config should render.
        await expect(page.getByRole('heading', { name: 'Act 2 - Fork' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Sneak In' })).toBeVisible();

        // Paths exist, so each part card shows a "Path:" assignment select.
        const pathLabels = page.getByText('Path:', { exact: true });
        await expect(pathLabels.first()).toBeVisible();
        // One per part (4 parts).
        await expect(pathLabels).toHaveCount(4);

        // The PathManager lists both defined paths (branch-after selects show them too).
        await expect(page.getByText('Branch after:').first()).toBeVisible();
    });
});
