import { test, expect } from '@playwright/test';
import { MUNDO_CAMPAIGN, MUNDO_CAMPAIGN_CON_ESTADO } from './fixtures/mundoCampaign';
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

// ── M2: drill-in / tiers / breadcrumb ───────────────────────────────────────

test.describe('World Mode - Drill-in & tiers', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);
    });

    test('double-clicking a sistema drills into the system tier', async ({ page }) => {
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();

        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        // Children of sistema_verne render as system-tier nodes...
        await expect(page.locator('[data-entity-id="kovar_iii"]')).toBeAttached();
        await expect(page.locator('[data-entity-id="porto_verne"]')).toBeAttached();
        // ...and sector-only nodes are gone.
        await expect(page.locator('[data-entity-id="sistema_kessler"]')).toHaveCount(0);
        await expect(page.locator('[data-entity-id="nodo_central"]')).toHaveCount(0);
    });

    test('breadcrumb pops back from system to sector', async ({ page }) => {
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();

        // The sector crumb becomes a button once drilled in.
        await page.getByRole('button', { name: 'Sector Eloran' }).click();

        await expect(page.locator('[data-tier="system"]')).toHaveCount(0);
        await expect(page.locator('[data-entity-id]')).toHaveCount(4);
        await expect(page.locator('[data-entity-id="sistema_kessler"]')).toBeVisible();
    });

    test('party bar shows the absent-estado hint (fixture has empty estado/)', async ({ page }) => {
        const bar = page.locator('[data-party-bar]');
        await expect(bar).toBeVisible();
        await expect(bar).toContainText('no hay datos del grupo');
    });
});

// ── M2: search + deep link ──────────────────────────────────────────────────

test.describe('World Mode - Search & deep link', () => {
    test('Ctrl+K search finds Porto Verne and Enter navigates to it', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);

        await page.keyboard.press('ControlOrMeta+k');
        const input = page.getByPlaceholder('Buscar en el mundo…');
        await expect(input).toBeVisible();
        await input.fill('Porto');

        await expect(page.locator('[data-search-result-id="porto_verne"]')).toBeVisible();
        await input.press('Enter');

        // Selected + navigated to the system tier + deep link written.
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
        await expect(page.locator('[data-entity-panel]')).toContainText('Porto Verne');
        await expect(page).toHaveURL(/[?&]e=porto_verne/);
    });

    test('deep link ?e=porto_verne lands selected at the system tier', async ({ page }) => {
        await page.goto('/world?e=porto_verne');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);

        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
        await expect(page).toHaveURL(/[?&]e=porto_verne/);
    });
});

// ── M2: party readout (estado/grupo.md variant) ─────────────────────────────

test.describe('World Mode - Party readout', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);
    });

    test('party bar renders fecha, creditos, gauges and the location breadcrumb', async ({ page }) => {
        const bar = page.locator('[data-party-bar]');
        await expect(bar).toBeVisible();

        // Fecha from dia_mundo 4127 under the 4x30 fixture calendar.
        await expect(bar).toContainText('17 de Cenit, 356 dG');
        await expect(bar.locator('[data-dia="4127"]')).toBeAttached();

        await expect(bar.locator('[data-creditos="1240"]')).toBeVisible();

        await expect(bar.locator('[data-medidor="viveres"][data-valor="3"]')).toBeAttached();
        await expect(bar.locator('[data-medidor="combustible"][data-valor="2"]')).toBeAttached();
        await expect(bar.locator('[data-medidor="nave"][data-valor="2"]')).toBeAttached();

        const breadcrumb = bar.getByRole('navigation', { name: 'Ubicación' });
        await expect(breadcrumb).toContainText('Sistema Verne');
        await expect(breadcrumb).toContainText('Porto Verne');
    });

    test('party marker rolls up to the sistema at sector tier and to the place at system tier', async ({ page }) => {
        const marker = page.locator('[data-party-marker]');

        // Sector tier: ubicacion porto_verne rolls up to sistema_verne (coords 0,0).
        await expect(marker).toBeAttached();
        await expect(marker).toHaveAttribute('transform', 'translate(0 0)');

        // System tier: the marker sits on porto_verne's own node (not the star).
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(marker).toBeAttached();
        await expect(marker).not.toHaveAttribute('transform', 'translate(0 0)');
    });
});
