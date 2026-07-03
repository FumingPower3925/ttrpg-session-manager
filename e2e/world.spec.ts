import { test, expect } from '@playwright/test';
import { MUNDO_CAMPAIGN } from './fixtures/mundoCampaign';
import { materializeIntoOPFS, openWorldViaOPFS } from './helpers/opfs';

// World mode loads the mundoCampaign fixture through the OPFS seam
// (see e2e/helpers/opfs.ts for the app-side contract these tests rely on).
test.describe('World Mode - Sector Map', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);
    });

    test('renders the 3 systems and the deep-space node at sector tier', async ({ page }) => {
        // sistema_verne, sistema_kessler, sistema_umbral + nodo_central (own coords).
        // Plain lugares (kovar_iii, mercado_de_brasa, porto_verne) live inside
        // systems and must NOT be sector-tier nodes.
        await expect(page.locator('[data-entity-id]')).toHaveCount(4);
        await expect(page.locator('[data-entity-id="sistema_verne"]')).toBeVisible();
        await expect(page.locator('[data-entity-id="sistema_kessler"]')).toBeVisible();
        // desconocido renders as a low-opacity ghost — assert presence, not visibility.
        await expect(page.locator('[data-entity-id="sistema_umbral"]')).toBeAttached();
        await expect(page.locator('[data-entity-id="nodo_central"]')).toBeAttached();
    });

    test('encodes conocimiento on each node via data-knowledge', async ({ page }) => {
        await expect(page.locator('[data-entity-id="sistema_umbral"]')).toHaveAttribute(
            'data-knowledge',
            'desconocido'
        );
        await expect(page.locator('[data-entity-id="sistema_kessler"]')).toHaveAttribute(
            'data-knowledge',
            'rumoreado'
        );
        await expect(page.locator('[data-entity-id="sistema_verne"]')).toHaveAttribute(
            'data-knowledge',
            'visitado'
        );
    });

    test('ghost toggle hides desconocido nodes', async ({ page }) => {
        await expect(page.locator('[data-entity-id="sistema_umbral"]')).toBeAttached();

        // Accessible name contains "desconocidos" (e.g. "Ocultar desconocidos").
        await page.getByRole('button', { name: /desconocid/i }).click();

        await expect(page.locator('[data-entity-id="sistema_umbral"]')).toBeHidden();
        // The rest of the sector is unaffected.
        await expect(page.locator('[data-entity-id="sistema_verne"]')).toBeVisible();
        await expect(page.locator('[data-entity-id="sistema_kessler"]')).toBeVisible();
        await expect(page.locator('[data-entity-id="nodo_central"]')).toBeAttached();
    });

    test('clicking a system opens the entity panel with name and conocimiento badge', async ({ page }) => {
        await page.locator('[data-entity-id="sistema_verne"]').click();

        const panel = page.locator('[data-entity-panel]');
        await expect(panel).toBeVisible();
        await expect(panel).toContainText('Sistema Verne');
        await expect(panel.getByText(/visitado/i).first()).toBeVisible();
    });

    test('roto.md surfaces in the Diagnostico panel without breaking the load', async ({ page }) => {
        // The world loaded degraded (beforeEach already reached "ready" with
        // roto.md present), and the issue is surfaced to the GM.
        const diagnostics = page.getByRole('button', { name: /diagn[oó]stico/i });
        await expect(diagnostics).toBeVisible();
        await diagnostics.click();
        await expect(page.getByText(/roto\.md/).first()).toBeVisible();
    });

    test('scanner ignores PLANTILLAS/ and _-prefixed files', async ({ page }) => {
        // No map nodes (or any entity-bound elements) for ignored files.
        await expect(page.locator('[data-entity-id="_borrador"]')).toHaveCount(0);
        await expect(page.locator('[data-entity-id="borrador"]')).toHaveCount(0);
        await expect(page.locator('[data-entity-id="pista"]')).toHaveCount(0);

        // Not even as diagnostics: if _borrador.md had been scanned it would
        // show up as a "lugar without en:/coordenadas" error alongside roto.md.
        await page.getByRole('button', { name: /diagn[oó]stico/i }).click();
        await expect(page.getByText(/roto\.md/).first()).toBeVisible();
        await expect(page.getByText(/_borrador/)).toHaveCount(0);
        await expect(page.getByText(/PLANTILLAS/)).toHaveCount(0);
    });
});
