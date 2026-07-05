import { test, expect } from '@playwright/test';
import {
    MUNDO_CAMPAIGN,
    MUNDO_CAMPAIGN_CON_ESTADO,
    MUNDO_CAMPAIGN_CON_MUSICA,
} from './fixtures/mundoCampaign';
import type { FileTree } from './fixtures/mundoCampaign';
import { listOPFSDir, materializeIntoOPFS, openWorldViaOPFS, readOPFSFile } from './helpers/opfs';

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

    test('double-clicking a place with children opens the SiteList (tier 3)', async ({ page }) => {
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();

        // porto_verne contains torre_korinth (NO poi) -> dblclick drills into
        // the non-spatial SiteList (the Plano fallback / regression case).
        await page.locator('[data-entity-id="porto_verne"]').dblclick();
        const list = page.locator('[data-site-list="porto_verne"]');
        await expect(list).toBeVisible();
        await expect(list.locator('[data-site-id="torre_korinth"]')).toBeVisible();
        // No spatial place tier was entered.
        await expect(page.locator('[data-tier="place"]')).toHaveCount(0);
        // The duplicate EntityPanel for the SAME lugar is suppressed (the list
        // header already names it); selecting a row brings the panel back.
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toHaveCount(0);

        await list.locator('[data-site-id="torre_korinth"]').click();
        await expect(page.locator('[data-entity-panel="torre_korinth"]')).toBeVisible();

        // Breadcrumb carries all three levels; the middle crumb pops the list.
        const crumbs = page.getByRole('navigation', { name: 'Ruta del mapa' });
        await expect(crumbs).toContainText('Porto Verne');
        await crumbs.getByRole('button', { name: 'Sistema Verne' }).click();
        await expect(page.locator('[data-site-list="porto_verne"]')).toHaveCount(0);
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
    });

    test('double-clicking a place with POI children opens the spatial Plano (tier 3)', async ({
        page,
    }) => {
        await page.locator('[data-entity-id="sistema_kessler"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(page.locator('[data-entity-id="mercado_de_brasa"]')).toBeAttached();

        // mercado_de_brasa has poi-coord children -> dblclick renders the Plano.
        await page.locator('[data-entity-id="mercado_de_brasa"]').dblclick();
        const plano = page.locator('[data-tier="place"]');
        await expect(plano).toBeAttached();
        // No non-spatial SiteList this time.
        await expect(page.locator('[data-site-list="mercado_de_brasa"]')).toHaveCount(0);

        // POIs render spatially as entity nodes (both placed and "sin ubicar").
        await expect(plano.locator('[data-entity-id="rampa_carga"]')).toBeAttached();
        await expect(plano.locator('[data-entity-id="sala_franca"]')).toBeAttached();
        await expect(plano.locator('[data-entity-id="trastienda"]')).toBeAttached();
        // The hub glyph carries the place's own id.
        await expect(plano.locator('[data-entity-id="mercado_de_brasa"]')).toBeAttached();

        // Affordance badges: sala_franca (servicios mercado/contrabando, conocido)
        // shows a SHOP icon; rampa_carga (servicios informacion, visitado) shows an
        // INFO icon. trastienda (rumoreado) must NOT leak any affordance, and the
        // shop node carries no info icon (nor vice versa).
        await expect(
            plano.locator('[data-entity-id="sala_franca"] [data-node-icon="shop"]')
        ).toBeAttached();
        await expect(
            plano.locator('[data-entity-id="sala_franca"] [data-node-icon="info"]')
        ).toHaveCount(0);
        await expect(
            plano.locator('[data-entity-id="rampa_carga"] [data-node-icon="info"]')
        ).toBeAttached();
        await expect(
            plano.locator('[data-entity-id="rampa_carga"] [data-node-icon="shop"]')
        ).toHaveCount(0);
        await expect(
            plano.locator('[data-entity-id="trastienda"] [data-node-icon]')
        ).toHaveCount(0);

        // The legend key is present so the icons are self-explanatory.
        await expect(page.locator('[data-map-legend]')).toBeVisible();

        // Clicking a POI selects it (panel shows it).
        await plano.locator('[data-entity-id="rampa_carga"]').click();
        await expect(page.locator('[data-entity-panel="rampa_carga"]')).toBeVisible();

        // Breadcrumb: Sector -> Sistema Kessler -> Mercado de Brasa. The sistema
        // crumb pops back to the system tier.
        const crumbs = page.getByRole('navigation', { name: 'Ruta del mapa' });
        await expect(crumbs).toContainText('Mercado de Brasa');
        await crumbs.getByRole('button', { name: 'Sistema Kessler' }).click();
        await expect(page.locator('[data-tier="place"]')).toHaveCount(0);
        await expect(page.locator('[data-tier="system"]')).toBeAttached();

        // Back out to the sector tier.
        await page.getByRole('button', { name: 'Sector Eloran' }).click();
        await expect(page.locator('[data-tier="system"]')).toHaveCount(0);
        await expect(page.locator('[data-entity-id]')).toHaveCount(4);
    });
});

// ── B1 fix: cockpit bootstrap without estado/grupo.md ───────────────────────

test.describe('World Mode - Crear estado/grupo.md', () => {
    test('the null-estado bar offers creating the file and unblocks the session', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN); // estado/ empty
        await openWorldViaOPFS(page);

        const bar = page.locator('[data-party-bar]');
        await expect(bar).toContainText('no hay datos del grupo');

        await page.locator('[data-create-estado]').click();

        // The bar switches to the live readout with the defaults...
        await expect(bar.locator('[data-creditos="0"]')).toBeVisible();
        await expect(bar.locator('[data-medidor="viveres"][data-valor="3"]')).toBeAttached();
        await expect(page.locator('[data-session-start]')).toBeEnabled();

        // ...and the file landed on disk, agent-parseable.
        const estado = await readOPFSFile(page, 'mundo/estado/grupo.md');
        expect(estado).toContain('tipo: estado_grupo');
        expect(estado).toContain('sesion_activa: false');

        // The unblocked cockpit records for real.
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
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

// ── M3: session recorder (write path via OPFS — no permission prompts) ──────
//
// NOTE (h): the permission-DENIED path cannot be exercised through OPFS —
// its handles always report/grant readwrite without prompting, so there is no
// way to make requestPermission return 'denied' from Playwright. That branch
// is covered by unit tests instead: JournalWriter denied/retryNow/flush-reject
// (lib/world/journalWriter.test.ts) and the failed-close + retryWrites cases
// (lib/world/partyStore.test.ts).

/** Body of estado/grupo.md (everything after the closing frontmatter fence). */
function frontmatterBody(fileText: string): string {
    return fileText.slice(fileText.indexOf('\n---\n', 3) + '\n---\n'.length);
}

test.describe('World Mode - Session recorder', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);
    });

    test('quick-log is disabled until a session starts', async ({ page }) => {
        await expect(page.locator('[data-quicklog-bar]')).toBeVisible();
        await expect(page.locator('[data-quicklog="creditos"]')).toBeDisabled();
        await expect(page.locator('[data-quicklog="mover"]')).toBeDisabled();
        await expect(page.locator('[data-session-start]')).toBeEnabled();
    });

    test('full recorder loop: start, quick-logs, mover, undo, end', async ({ page }) => {
        // (a) Iniciar sesión -> diario file with sesion: 1 + inicio line.
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();

        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
        const [journalName] = await listOPFSDir(page, 'mundo/diario');
        expect(journalName).toMatch(/^\d{4}-\d{2}-\d{2}_s01\.md$/);
        const journalPath = `mundo/diario/${journalName}`;

        const initial = await readOPFSFile(page, journalPath);
        expect(initial).toContain('tipo: diario');
        expect(initial).toContain('sesion: 1');
        expect(initial).toContain('dia_inicio: 4127');
        expect(initial).toContain('dia_fin: null');
        expect(initial).toContain('procesado: false');
        expect(initial).toMatch(/- \[\d{2}:\d{2}\] inicio: dia 4127 @ porto_verne/);

        // (b) gasto 100 via the créditos popover -> toast + journal line + bar.
        await page.locator('[data-quicklog="creditos"]').click();
        await page.locator('[data-quicklog-delta="-100"]').click();
        await expect(page.getByText('-100 créditos anotados')).toBeVisible();
        await expect(page.locator('[data-party-bar] [data-creditos="1140"]')).toBeVisible();
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] gasto: 100/);

        // (c) medidor combustible 2 -> 4 via the pips popover.
        await page.locator('[data-quicklog="combustible"]').click();
        await page
            .locator('[data-quicklog-pips="combustible"] [data-quicklog-pip="4"]')
            .click();
        await expect(
            page.locator('[data-party-bar] [data-medidor="combustible"][data-valor="4"]')
        ).toBeAttached();
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] medidor: combustible 2->4/);

        // (d) nota via the "n" keyboard shortcut.
        await page.keyboard.press('n');
        const notaInput = page.locator('[data-quicklog-nota-input]');
        await expect(notaInput).toBeFocused();
        await notaInput.fill('los PJ preguntan por Kael');
        await notaInput.press('Enter');
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] nota: los PJ preguntan por Kael/);

        // (e) Mover to kovar_iii -> llegada line, marker moved, knowledge bump.
        await page.locator('[data-quicklog="mover"]').click();
        await page.locator('[data-mover-id="kovar_iii"]').click();
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] llegada: kovar_iii \| dia 4127/);

        const bar = page.locator('[data-party-bar]');
        await expect(bar.getByRole('navigation', { name: 'Ubicación' })).toContainText('Kovar III');
        // navigateToEntity landed on the system tier; the marker sits on
        // kovar_iii's own node there, not on the star at (0,0).
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        const marker = page.locator('[data-party-marker]');
        await expect(marker).toBeAttached();
        await expect(marker).not.toHaveAttribute('transform', 'translate(0 0)');
        await expect(page.locator('[data-entity-id="kovar_iii"]')).toHaveAttribute(
            'data-knowledge',
            'visitado'
        );

        // (f) Deshacer última: the llegada line leaves the file and the UI reverts.
        await page.locator('[data-panel-tab="diario"]').click();
        await page.locator('[data-journal-undo]').click();
        await expect.poll(() => readOPFSFile(page, journalPath)).not.toMatch(/llegada: kovar_iii/);
        await expect(bar.getByRole('navigation', { name: 'Ubicación' })).toContainText(
            'Porto Verne'
        );

        // (g) Terminar sesión -> fin line + dia_fin + estado frontmatter updated
        // with the agent-owned body preserved byte-for-byte.
        await page.locator('[data-session-end]').click();
        await page.locator('[data-session-save]').click();
        await expect(page.locator('[data-session-start]')).toBeVisible();

        const journalFinal = await readOPFSFile(page, journalPath);
        expect(journalFinal).toMatch(/- \[\d{2}:\d{2}\] fin: dia 4127 @ porto_verne/);
        expect(journalFinal).toContain('dia_fin: 4127');
        expect(journalFinal).toContain('procesado: false');
        expect(journalFinal).not.toContain('llegada: kovar_iii');

        await expect
            .poll(() => readOPFSFile(page, 'mundo/estado/grupo.md'))
            .toContain('sesion_activa: false');
        const estadoFinal = await readOPFSFile(page, 'mundo/estado/grupo.md');
        expect(estadoFinal).toContain('tipo: estado_grupo');
        expect(estadoFinal).toContain('creditos: 1140');
        expect(estadoFinal).toContain('combustible: 4');
        expect(estadoFinal).toContain('ubicacion: porto_verne');

        const mundoFixture = MUNDO_CAMPAIGN_CON_ESTADO.mundo as FileTree;
        const grupoFixture = (mundoFixture.estado as FileTree)['grupo.md'] as string;
        expect(frontmatterBody(estadoFinal)).toBe(frontmatterBody(grupoFixture));
    });
});

// ── M4: travel + events ─────────────────────────────────────────────────────

test.describe('World Mode - Travel & events', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);
    });

    /** Starts a session and returns the diario path (single file, sesion 1). */
    async function startSession(page: import('@playwright/test').Page): Promise<string> {
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
        const [journalName] = await listOPFSDir(page, 'mundo/diario');
        return `mundo/diario/${journalName}`;
    }

    test('travel flow: Viajar aquí -> dialog -> stepper -> arrival with journal trail', async ({ page }) => {
        const journalPath = await startSession(page);

        // Select kovar_iii at the system tier (party is at porto_verne).
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await page.locator('[data-entity-id="kovar_iii"]').click();
        await expect(page.locator('[data-entity-panel="kovar_iii"]')).toBeVisible();

        await page.locator('[data-travel-here]').click();
        const dialog = page.locator('[data-travel-dialog]');
        await expect(dialog).toBeVisible();
        // Intra-system hop: 1 flat day, no fuel (pips stay 2 -> 2) — but the
        // calendar crosses dia 4128 (multiple of viveres_cada_dias 4), so the
        // dialog previews exactly 1 ración: 3 -> 2.
        await expect(dialog.locator('[data-travel-total-dias="1"]')).toBeVisible();
        await expect(
            dialog.locator('[data-travel-medidor="combustible"][data-antes="2"][data-despues="2"]')
        ).toBeAttached();
        await expect(
            dialog.locator('[data-travel-medidor="viveres"][data-antes="3"][data-despues="2"]')
        ).toBeAttached();

        await page.locator('[data-travel-confirm]').click();
        const stepper = page.locator('[data-travel-stepper]');
        await expect(stepper).toBeVisible();
        await expect(stepper).toHaveAttribute('data-dia', '1');
        await expect(stepper).toHaveAttribute('data-total-dias', '1');

        // Undo is blocked mid-travel (the stepper's day counter lives outside
        // the journal, so a replay-undo could not revert it)…
        await page.locator('[data-panel-tab="diario"]').click();
        await expect(page.locator('[data-journal-undo]')).toBeDisabled();

        // Continuar on the last day = arrival: stepper gone, breadcrumb moved.
        await page.locator('[data-travel-next]').click();
        await expect(page.locator('[data-travel-stepper]')).toHaveCount(0);
        // …and re-enables once the trip resolves (arrival re-selects the
        // destination entity, which flips the panel back to Entidad).
        await page.locator('[data-panel-tab="diario"]').click();
        await expect(page.locator('[data-journal-undo]')).toBeEnabled();
        await expect(
            page.locator('[data-party-bar]').getByRole('navigation', { name: 'Ubicación' })
        ).toContainText('Kovar III');

        // Full journal trail: rumbo -> dia -> consumo -> llegada.
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] llegada: kovar_iii \| dia 4128/);
        const journal = await readOPFSFile(page, journalPath);
        expect(journal).toMatch(
            /- \[\d{2}:\d{2}\] rumbo: kovar_iii \| 1 dias, llegada estimada dia 4128/
        );
        expect(journal).toMatch(/- \[\d{2}:\d{2}\] dia: 4127->4128/);
        // The calendar tick journaled as a medidor entry (replay-safe trail).
        expect(journal).toMatch(
            /- \[\d{2}:\d{2}\] medidor: viveres 3->2 \| consumo de víveres/
        );
        await expect(
            page.locator('[data-party-bar] [data-medidor="viveres"][data-valor="2"]')
        ).toBeAttached();
    });

    test('travel dialog in viewer mode: plan previews, confirm disabled with hint', async ({ page }) => {
        // NO session on purpose: previewing routes is legit, travelling records.
        await page.locator('[data-entity-id="sistema_kessler"]').click();
        await expect(page.locator('[data-entity-panel="sistema_kessler"]')).toBeVisible();
        await page.locator('[data-travel-here]').click();

        const dialog = page.locator('[data-travel-dialog]');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('[data-travel-total-dias="8"]')).toBeVisible();
        await expect(dialog.locator('[data-travel-session-hint]')).toBeVisible();
        await expect(dialog.locator('[data-travel-confirm]')).toBeDisabled();
    });

    test('insufficiency warning carries the schedule-derived depletion day', async ({ page }) => {
        await startSession(page);

        // Drop combustible to 1: the 8-day Kessler run needs ceil(7/4) = 2.
        await page.locator('[data-quicklog="combustible"]').click();
        await page.locator('[data-quicklog-pips="combustible"] [data-quicklog-pip="1"]').click();
        await expect(
            page.locator('[data-party-bar] [data-medidor="combustible"][data-valor="1"]')
        ).toBeAttached();

        await page.locator('[data-entity-id="sistema_kessler"]').click();
        await page.locator('[data-travel-here]').click();
        const dialog = page.locator('[data-travel-dialog]');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('Combustible insuficiente')).toBeVisible();
        // Fuel ticks on trip days 5 and 8 (sector leg-days 4 and 7): with 1
        // in the tank the second tick cannot be covered -> depletion day 8.
        await expect(dialog.locator('[data-travel-agotamiento-combustible="8"]')).toBeVisible();
        // GM override stays available (destructive confirm).
        await expect(dialog.locator('[data-travel-confirm]')).toBeEnabled();
        await dialog.getByRole('button', { name: 'Cancelar' }).click();
        await expect(dialog).toBeHidden();
    });

    test('descanso: quick-log button advances the calendar and ticks víveres', async ({ page }) => {
        const journalPath = await startSession(page);

        // +3 days from 4127 crosses 4128 (multiple of 4) -> exactly 1 ración.
        await page.locator('[data-quicklog="descanso"]').click();
        await page.locator('[data-quicklog-descanso-dias="3"]').click();

        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] descanso: 3 dias/);
        expect(await readOPFSFile(page, journalPath)).toMatch(
            /- \[\d{2}:\d{2}\] medidor: viveres 3->2 \| consumo de víveres/
        );
        const bar = page.locator('[data-party-bar]');
        await expect(bar.locator('[data-dia="4130"]')).toBeAttached();
        await expect(bar.locator('[data-medidor="viveres"][data-valor="2"]')).toBeAttached();

        // Custom amount: +2 from 4130 crosses 4132 -> a second ración.
        await page.locator('[data-quicklog="descanso"]').click();
        const custom = page.locator('[data-quicklog-descanso-custom]');
        await custom.fill('2');
        await custom.press('Enter');
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] descanso: 2 dias/);
        await expect(bar.locator('[data-dia="4132"]')).toBeAttached();
        await expect(bar.locator('[data-medidor="viveres"][data-valor="1"]')).toBeAttached();
    });

    test('a tick on an empty gauge journals the deficit nota, never medidor 0->0', async ({ page }) => {
        const journalPath = await startSession(page);

        // Empty the pantry, then rest across a ration day (4128).
        await page.locator('[data-quicklog="viveres"]').click();
        await page.locator('[data-quicklog-pips="viveres"] [data-quicklog-pip="0"]').click();
        await expect(
            page.locator('[data-party-bar] [data-medidor="viveres"][data-valor="0"]')
        ).toBeAttached();

        await page.locator('[data-quicklog="descanso"]').click();
        await page.locator('[data-quicklog-descanso-dias="3"]').click();

        // Complication hook: deficit nota + warning toast with the event action.
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] nota: Sin víveres desde el día 4130 — el grupo pasa hambre/);
        expect(await readOPFSFile(page, journalPath)).not.toMatch(/medidor: viveres 0->0/);
        await expect(page.getByText('el grupo pasa hambre', { exact: false }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Tirar evento' })).toBeVisible();
    });

    test('estancia event: draw, apply the ganancia efecto, resolve', async ({ page }) => {
        const journalPath = await startSession(page);

        await page.locator('[data-quicklog="evento"]').click();
        const drawer = page.locator('[data-event-drawer]');
        await expect(drawer).toHaveAttribute('data-state', 'open');
        // The only estancia table in region nucleo has a single si-free event.
        await expect(drawer).toContainText('Encargo de descarga');

        // One-tap ganancia efecto -> party bar + journal line.
        await drawer.locator('[data-event-effect="0"]').click();
        await expect(page.locator('[data-party-bar] [data-creditos="1440"]')).toBeVisible();
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] ganancia: 200/);

        // M5 hardening: the second efecto names a gauge that is NOT in
        // manifest.medidores (oxigeno) — it must degrade to a nota entry +
        // warning toast instead of journaling a medidor line for an
        // invisible gauge.
        await drawer.locator('[data-event-effect="1"]').click();
        await expect(
            page.getByText('Medidor desconocido «oxigeno» — anotado como nota')
        ).toBeVisible();
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] nota: Efecto no aplicado: medidor desconocido oxigeno/);
        expect(await readOPFSFile(page, journalPath)).not.toMatch(/medidor: oxigeno/);

        // Resuelto closes the drawer and journals the evento line.
        await drawer.locator('[data-event-outcome="resuelto"]').click();
        await expect(drawer).toHaveAttribute('data-state', 'closed');
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] evento: estancia_porto#e01 \| resuelto/);
    });

    // Dedup wiring no-regression: the drawer still opens/draws and the redraw
    // still returns an event with the new history-model plumbing in place. A
    // random draw is unit-covered (eventEngine.test.ts); here we only assert
    // the wiring did not break — the single-event estancia table means the
    // redraw's exclude-the-shown-event step empties the live pool and falls
    // back, so an event is always shown (never a dead-end drawer).
    test('event drawer opens and redraws with the dedup wiring (no regression)', async ({ page }) => {
        await startSession(page);

        await page.locator('[data-quicklog="evento"]').click();
        const drawer = page.locator('[data-event-drawer]');
        await expect(drawer).toHaveAttribute('data-state', 'open');
        await expect(drawer).toContainText('Encargo de descarga');

        // "Otra tirada" (redraw) still returns a drawn event, never emptiness.
        await drawer.locator('[data-event-redraw]').click();
        await expect(drawer).toHaveAttribute('data-state', 'open');
        await expect(drawer).toContainText('Encargo de descarga');
        // Redraw is one-shot per opening: the button is gone after using it.
        await expect(drawer.locator('[data-event-redraw]')).toHaveCount(0);

        await drawer.locator('[data-event-outcome="ignorado"]').click();
        await expect(drawer).toHaveAttribute('data-state', 'closed');
    });

    test('LeadsBoard: accionable star, transition, live re-derivation on gasto', async ({ page }) => {
        const journalPath = await startSession(page);

        // Default tab = Accionables; deuda_kael_zara (creditos>=800 vs 1240) stars.
        await page.locator('[data-panel-tab="pistas"]').click();
        const row = page.locator('[data-lead-id="deuda_kael_zara"]');
        await expect(row).toBeVisible();
        await expect(row.getByLabel('Accionable')).toBeVisible();

        // One-tap transition activa -> en_curso is journaled.
        await row.locator('[data-lead-transition="en_curso"]').click();
        await expect(page.locator('[data-lead-id="deuda_kael_zara"]')).toHaveAttribute(
            'data-lead-estado',
            'en_curso'
        );
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] pista: deuda_kael_zara activa->en_curso/);

        // Dropping below 800 credits re-derives: the lead leaves Accionables...
        await page.locator('[data-quicklog="creditos"]').click();
        const custom = page.locator('[data-quicklog-creditos-custom]');
        await custom.fill('-700');
        await custom.press('Enter');
        await expect(page.locator('[data-party-bar] [data-creditos="540"]')).toBeVisible();
        await expect(page.locator('[data-lead-id="deuda_kael_zara"]')).toHaveCount(0);

        // ...and shows starless under Activas.
        await page.locator('[data-leads-tab="activas"]').click();
        await expect(page.locator('[data-lead-id="deuda_kael_zara"]')).toBeVisible();
        await expect(
            page.locator('[data-lead-id="deuda_kael_zara"]').getByLabel('Accionable')
        ).toHaveCount(0);
    });

    test('RoutePreview shows at sector tier for a cross-system selection and hides on drill-in', async ({ page }) => {
        // porto_verne -> sistema_kessler: 1 intra day + ceil(√45)=7 sector days;
        // combustible = ceil(7/4) = 2 (per-day cadence on the sector leg).
        await page.locator('[data-entity-id="sistema_kessler"]').click();
        const preview = page.locator('[data-route-preview]');
        await expect(preview).toBeVisible();
        await expect(preview).toContainText('8 días · −2 combustible');

        // System tier renders no routes layer -> the preview is gone.
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(page.locator('[data-route-preview]')).toHaveCount(0);
    });
});

// ── Feature 1 + 2: Ongoing events ("En curso") + cockpit combat ─────────────
//
// estancia_porto#e01 "Encargo de descarga" is the single estancia event in
// region nucleo (drawn from the QuickLogBar "evento" button at porto_verne).
// The CON_ESTADO fixture carries personajes: [Xiao, Chesco] for the cockpit
// initiative tracker.

test.describe('World Mode - Eventos en curso & combate', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);
    });

    /** Starts a session and returns the diario path (single file, sesion 1). */
    async function startSession(page: import('@playwright/test').Page): Promise<string> {
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
        const [journalName] = await listOPFSDir(page, 'mundo/diario');
        return `mundo/diario/${journalName}`;
    }

    test('(a) En curso parks the event; the Eventos tab lists it, reopen + Resuelto closes it', async ({ page }) => {
        const journalPath = await startSession(page);

        // Draw an estancia event and PARK it "En curso".
        await page.locator('[data-quicklog="evento"]').click();
        const drawer = page.locator('[data-event-drawer]');
        await expect(drawer).toHaveAttribute('data-state', 'open');
        await expect(drawer).toContainText('Encargo de descarga');
        await drawer.locator('[data-event-outcome="en_curso"]').click();
        await expect(drawer).toHaveAttribute('data-state', 'closed');

        // Journal carries the "en curso" comentario (exact string).
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] evento: estancia_porto#e01 \| en curso/);

        // Eventos tab badge = 1 and the row is visible.
        const eventosTab = page.locator('[data-panel-tab="eventos"]');
        await expect(eventosTab.locator('[data-eventos-badge="1"]')).toBeVisible();
        await eventosTab.click();
        const row = page.locator('[data-ongoing-event="estancia_porto#e01"]');
        await expect(row).toBeVisible();
        await expect(row).toContainText('Encargo de descarga');

        // Clicking the row (data-ongoing-open is on the row button itself)
        // reopens the event drawer with that event.
        await expect(row).toHaveAttribute('data-ongoing-open');
        await row.click();
        await expect(drawer).toHaveAttribute('data-state', 'open');
        await expect(drawer).toContainText('Encargo de descarga');

        // Pick Resuelto: drawer closes, the event drops from ongoing, badge gone.
        await drawer.locator('[data-event-outcome="resuelto"]').click();
        await expect(drawer).toHaveAttribute('data-state', 'closed');
        await expect(page.locator('[data-eventos-badge]')).toHaveCount(0);
        await expect(page.locator('[data-ongoing-event="estancia_porto#e01"]')).toHaveCount(0);
        await expect(page.locator('[data-eventos-empty]')).toBeVisible();

        // Journal shows both states for the id: "en curso" then "resuelto".
        const journal = await readOPFSFile(page, journalPath);
        expect(journal).toMatch(/- \[\d{2}:\d{2}\] evento: estancia_porto#e01 \| en curso/);
        expect(journal).toMatch(/- \[\d{2}:\d{2}\] evento: estancia_porto#e01 \| resuelto/);
    });

    test('(b) Abrir combate parks the event and reveals the initiative affordance', async ({ page }) => {
        const journalPath = await startSession(page);

        await page.locator('[data-quicklog="evento"]').click();
        const drawer = page.locator('[data-event-drawer]');
        await expect(drawer).toHaveAttribute('data-state', 'open');

        // "Abrir combate": parks en_curso + reveals initiative + closes drawer.
        await drawer.locator('[data-event-combat]').click();
        await expect(drawer).toHaveAttribute('data-state', 'closed');

        // The event is parked (Eventos tab shows it).
        await expect(page.locator('[data-panel-tab="eventos"] [data-eventos-badge="1"]')).toBeVisible();
        await page.locator('[data-panel-tab="eventos"]').click();
        await expect(page.locator('[data-ongoing-event="estancia_porto#e01"]')).toBeVisible();
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] evento: estancia_porto#e01 \| en curso/);

        // The initiative affordance is present (the cockpit tracker is mounted;
        // it renders its own left-edge pull-tab). data-combat-open stays too.
        await expect(page.locator('[data-combat-open]')).toBeVisible();
    });

    test('(c) Combate force-opens the initiative panel with the PC roster', async ({ page }) => {
        await startSession(page);

        // No ActRunner open -> Combate mounts the COCKPIT tracker AND force-opens
        // the full panel via openSignal — the PC rows render WITHOUT a hover.
        await page.locator('[data-combat-open]').click();
        await expect(page.getByText('Xiao', { exact: true }).first()).toBeVisible();
        await expect(page.getByText('Chesco', { exact: true }).first()).toBeVisible();
    });

    test('(e) Revelar lights a ghost entity so it becomes conocido + Mover-able', async ({ page }) => {
        await startSession(page); // sabe: must be journaled

        // sistema_umbral starts desconocido (a ghost at the sector tier).
        const umbral = page.locator('[data-entity-id="sistema_umbral"]');
        await expect(umbral).toHaveAttribute('data-knowledge', 'desconocido');
        await umbral.click();
        const panel = page.locator('[data-entity-panel="sistema_umbral"]');
        await expect(panel).toBeVisible();

        // Revelar bumps it to conocido (logs sabe:).
        await panel.locator('[data-reveal]').click();
        await expect(page.locator('[data-entity-id="sistema_umbral"]')).toHaveAttribute(
            'data-knowledge',
            'conocido'
        );

        // Now it is a valid Mover destination (Mover excludes desconocido).
        await page.locator('[data-quicklog="mover"]').click();
        await expect(page.locator('[data-mover-id="sistema_umbral"]')).toBeVisible();
    });

    test('(d) Terminar -> Descartar wipes the test session (journal gone, estado reverted)', async ({ page }) => {
        await startSession(page);
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);

        // Spend credits during the test session (would persist if saved).
        await page.locator('[data-quicklog="creditos"]').click();
        await page.locator('[data-quicklog-creditos-custom]').fill('-200');
        await page.locator('[data-quicklog-creditos-custom]').press('Enter');
        await expect(page.locator('[data-party-bar] [data-creditos="1040"]')).toBeVisible();

        // Terminar -> Descartar (prueba).
        await page.locator('[data-session-end]').click();
        await page.locator('[data-session-discard]').click();

        // Journal deleted; estado rolled back to the pre-session snapshot.
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(0);
        const estado = await readOPFSFile(page, 'mundo/estado/grupo.md');
        expect(estado).toContain('sesion_activa: false');
        expect(estado).toContain('creditos: 1240'); // reverted
        expect(estado).toMatch(/personajes:\s*\n?\s*(\[Xiao|-\s*Xiao)/); // roster preserved
        // UI reverted: session over, credits back.
        await expect(page.locator('[data-session-start]')).toBeVisible();
        await expect(page.locator('[data-party-bar] [data-creditos="1240"]')).toBeVisible();

        // A fresh session numbers as s01 again — the discarded one left no trace.
        await page.locator('[data-session-start]').click();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario'))[0] ?? '')
            .toMatch(/_s01\.md$/);
    });
});

// ── Feature: shop system (lugares/porto_verne/tiendas/muelles.md) ───────────
//
// The CON_ESTADO fixture adds a shop under porto_verne: "Suministros del Muelle
// 7", pnj kael_voss, items "Célula de combustible" (120 cr, stock 1) and
// "Raciones de campo" (40 cr, unlimited). The party starts with 1240 cr.

test.describe('World Mode - Tiendas', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);
    });

    /** Starts a session; returns the diario path (single file, sesion 1). */
    async function startSession(page: import('@playwright/test').Page): Promise<string> {
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
        const [journalName] = await listOPFSDir(page, 'mundo/diario');
        return `mundo/diario/${journalName}`;
    }

    /** Drills into sistema_verne and selects porto_verne (its EntityPanel). */
    async function openPortoVernePanel(page: import('@playwright/test').Page): Promise<void> {
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await page.locator('[data-entity-id="porto_verne"]').click();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
    }

    test('open a shop from the Tiendas section and buy an item', async ({ page }) => {
        const journalPath = await startSession(page);
        await openPortoVernePanel(page);

        // The Tiendas section lists the shop; clicking the row opens the ShopPanel.
        const shopLink = page.locator('[data-shop-link="muelles"]');
        await expect(shopLink).toBeVisible();
        await shopLink.click();
        const shop = page.locator('[data-shop-panel="muelles"]');
        await expect(shop).toBeVisible();
        await expect(shop).toContainText('Suministros del Muelle 7');
        await expect(shop).toContainText('Kael Voss'); // shopkeeper chip

        // The price shows as an editable input defaulting to the base (40).
        await expect(
            shop.locator('[data-shop-price-input="Raciones de campo"]')
        ).toHaveValue('40');

        // Buy the unlimited item at base: creditos drop by 40 (1240 -> 1200).
        await shop.locator('[data-shop-buy="Raciones de campo"]').click();
        await expect(page.locator('[data-party-bar] [data-creditos="1200"]')).toBeVisible();

        // Journal carries the gasto with the compra comentario (no negociado tag
        // at base price).
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] gasto: 40 \| compra: Raciones de campo(?! \(negociado)/);
    });

    test('negotiate a lower price: Comprar charges the edited amount', async ({ page }) => {
        const journalPath = await startSession(page);
        await openPortoVernePanel(page);
        await page.locator('[data-shop-link="muelles"]').click();
        const shop = page.locator('[data-shop-panel="muelles"]');
        await expect(shop).toBeVisible();

        // Negotiate the base 40 down to 25 in the price input.
        const priceInput = shop.locator('[data-shop-price-input="Raciones de campo"]');
        await priceInput.fill('25');
        // The base hint surfaces the deviation.
        await expect(shop.locator('[data-shop-price-base]').first()).toContainText('base 40');

        // Comprar charges 25: creditos drop by 25 (1240 -> 1215).
        await shop.locator('[data-shop-buy="Raciones de campo"]').click();
        await expect(page.locator('[data-party-bar] [data-creditos="1215"]')).toBeVisible();

        // Journal records the negotiated gasto with the base annotation.
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(
                /- \[\d{2}:\d{2}\] gasto: 25 \| compra: Raciones de campo \(negociado, base 40\)/
            );

        // After a buy the input resets back to the base price.
        await expect(priceInput).toHaveValue('40');
    });

    test('a stock-1 item blocks the second purchase', async ({ page }) => {
        await startSession(page);
        await openPortoVernePanel(page);
        await page.locator('[data-shop-link="muelles"]').click();
        const shop = page.locator('[data-shop-panel="muelles"]');
        await expect(shop).toBeVisible();

        const buyCell = shop.locator('[data-shop-buy="Célula de combustible"]');
        // First buy succeeds: creditos 1240 -> 1120, stock 1 -> 0.
        await buyCell.click();
        await expect(page.locator('[data-party-bar] [data-creditos="1120"]')).toBeVisible();

        // Now agotado: the Comprar button is disabled, a second buy does nothing.
        await expect(buyCell).toBeDisabled();
        await expect(page.locator('[data-party-bar] [data-creditos="1120"]')).toBeVisible();
    });

    test('without a session the Comprar buttons are disabled with a hint', async ({ page }) => {
        // No session started.
        await openPortoVernePanel(page);
        await page.locator('[data-shop-link="muelles"]').click();
        const shop = page.locator('[data-shop-panel="muelles"]');
        await expect(shop).toBeVisible();
        await expect(shop.locator('[data-shop-buy="Raciones de campo"]')).toBeDisabled();

        // Back returns to the place panel.
        await shop.locator('[data-shop-back]').click();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
    });
});

// ── Feature: in-app resumen (mundo/resumen.md) ──────────────────────────────

test.describe('World Mode - Resumen', () => {
    test('the Resumen button opens the recap dialog (CON_ESTADO has resumen.md)', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);

        const button = page.locator('[data-resumen-open]');
        await expect(button).toBeVisible();
        await button.click();

        const dialog = page.locator('[data-resumen-dialog]');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('Anteriormente');
        await expect(dialog).toContainText('bodega medio vacía');
    });

    test('a world without resumen.md shows no Resumen button (base fixture)', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN); // no resumen.md
        await openWorldViaOPFS(page);

        await expect(page.locator('[data-world-status="ready"]')).toBeAttached();
        await expect(page.locator('[data-resumen-open]')).toHaveCount(0);
    });
});

// ── M5: ActRunner (scripted acts inside /world) ─────────────────────────────
//
// porto_verne is the fixture's playable place: lugares/porto_verne/ holds
// plan/acto1_regreso.md in `:::` act format (flat plan file -> a single part
// named "Part 1" by scanSessionFolder's legacy fallback).

/** Selects porto_verne (system tier) and opens its ActRunner via Jugar. */
async function openPortoVerneRunner(page: import('@playwright/test').Page): Promise<void> {
    await page.locator('[data-entity-id="sistema_verne"]').dblclick();
    await page.locator('[data-entity-id="porto_verne"]').click();
    await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();

    await page.locator('[data-play-act]').click();
    await expect(page.locator('[data-act-runner]')).toBeVisible();
}

test.describe('World Mode - ActRunner', () => {
    test('Jugar opens the 3-panel act renderer and Cerrar returns to the cockpit', async ({ page }) => {
        // No estado fixture on purpose: viewing prep without a session is legit.
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);

        await openPortoVerneRunner(page);
        const runner = page.locator('[data-act-runner]');

        // Header: place name + the part on the act selector.
        await expect(runner).toContainText('Porto Verne');
        await expect(runner.locator('[data-act-part="Part 1"]')).toBeVisible();

        // Center column renders the fixture's :::leer read-aloud text...
        await expect(
            runner.getByText('Las luces del muelle se encienden en fila', { exact: false })
        ).toBeVisible();
        // ...the GM-notes rail carries the act-level :::gm reminder...
        await expect(runner.getByText('Recordatorios del acto')).toBeVisible();
        await expect(
            runner.getByText('Acto de apertura del arco', { exact: false })
        ).toBeVisible();
        // ...and the actions rail shows the active section's :::accion card.
        // (regex, not /^Acciones/: the rail header has a leading text node.)
        await expect(runner.getByText(/Acciones · 1\. Reentrada/)).toBeVisible();
        await expect(runner.getByText('Localizar a Kael Voss')).toBeVisible();

        // Cerrar unmounts the overlay and the cockpit map is visible again.
        await page.locator('[data-act-close]').click();
        await expect(page.locator('[data-act-runner]')).toHaveCount(0);
        await expect(page.locator('[data-entity-id="porto_verne"]')).toBeVisible();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
    });

    test('with an active session the journal records the acto iniciado/cerrado notas', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);

        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
        const [journalName] = await listOPFSDir(page, 'mundo/diario');
        const journalPath = `mundo/diario/${journalName}`;

        await openPortoVerneRunner(page);
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] nota: Acto iniciado: Part 1 @ Porto Verne/);

        await page.locator('[data-act-close]').click();
        await expect(page.locator('[data-act-runner]')).toHaveCount(0);
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] nota: Acto cerrado: Part 1 @ Porto Verne/);
    });
});

// ── World-level music (mundo/musica/ -> bottom-left audio dock) ─────────────
//
// The dock lists tracks and toggles open/closed; NOTHING here presses play —
// Playwright cannot verify sound and the fixture "mp3"s are fake bytes that
// would only error on decode. All assertions ride on data attributes /
// aria-pressed (the ActRunner-handoff contract in app/world/page.tsx).

test.describe('World Mode - Música del mundo', () => {
    test('the dock lists the BGM rotation and the event playlist', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_MUSICA);
        await openWorldViaOPFS(page);

        // Feature 3: the toggle is the QuickLogBar «Música» button now (the old
        // floating dock toggle was removed). Closed by default, no panel yet.
        const toggle = page.locator('[data-quicklog="musica"]');
        await expect(toggle).toBeVisible();
        await expect(page.locator('[data-world-audio="panel"]')).toHaveCount(0);

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const panel = page.locator('[data-world-audio="panel"]');
        await expect(panel).toBeVisible();

        // 2 root mp3s -> BGM rotation; 1 subfolder -> 1 playlist; the
        // _instrucciones.md prompt doc counts for neither.
        await expect(panel.locator('[data-world-audio-bgm-count="2"]')).toBeVisible();
        await expect(panel.locator('[data-world-audio-playlist-count="1"]')).toBeVisible();
        await expect(panel).toContainText('2 pistas · 1 lista');

        // The reused AudioControls renders the playlist selector: the BGM
        // entry plus the eventos_generales subfolder under its display name.
        await expect(panel.getByRole('button', { name: 'Background Music' })).toBeVisible();
        await expect(panel.getByRole('button', { name: 'Eventos Generales' })).toBeVisible();

        // Toggle back off: panel gone, button released.
        await toggle.click();
        await expect(page.locator('[data-world-audio="panel"]')).toHaveCount(0);
        await expect(toggle).not.toHaveAttribute('aria-expanded', 'true');
    });

    test('a world without mundo/musica/ still shows the dock, opening to an empty state', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN); // no musica/ folder
        await openWorldViaOPFS(page);

        await expect(page.locator('[data-world-status="ready"]')).toBeAttached();

        // The QuickLogBar «Música» button is ALWAYS present (an empty folder
        // must not read as a broken cockpit) — closed by default, no panel yet.
        const toggle = page.locator('[data-quicklog="musica"]');
        await expect(toggle).toBeVisible();
        await expect(page.locator('[data-world-audio="panel"]')).toHaveCount(0);

        // Open it: the empty-state panel with the "Sin música cargada" hint.
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const panel = page.locator('[data-world-audio="panel"]');
        await expect(panel).toBeVisible();
        await expect(page.locator('[data-world-audio="panel"][data-world-audio-empty]')).toBeVisible();
        await expect(panel).toContainText('Sin música cargada');
        await expect(panel).toContainText('mundo/musica/');
        // No AudioControls rendered (no manager exists for an empty folder).
        await expect(panel.locator('[data-world-audio-bgm-count]')).toHaveCount(0);

        // Toggle back off.
        await toggle.click();
        await expect(page.locator('[data-world-audio="panel"]')).toHaveCount(0);
    });

    test('the ActRunner conceals the dock and closing restores it with its state', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_MUSICA);
        await openWorldViaOPFS(page);

        // Leave the dock OPEN so the round-trip proves state survival. The
        // toggle is the QuickLogBar «Música» button now (feature 3).
        const toggle = page.locator('[data-quicklog="musica"]');
        await toggle.click();
        await expect(page.locator('[data-world-audio="panel"]')).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        // Runner open: the world dock is concealed (still mounted, hidden) —
        // the act music owns the room per the handoff contract.
        await openPortoVerneRunner(page);
        await expect(page.locator('[data-world-audio="panel"]')).toBeHidden();

        // Runner closed: dock back, still open (page-owned musicaOpen survived).
        await page.locator('[data-act-close]').click();
        await expect(page.locator('[data-act-runner]')).toHaveCount(0);
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('[data-world-audio="panel"]')).toBeVisible();
    });
});

// ── M5: UI persistence (sessionStorage slice, key world.ui.v1) ──────────────

test.describe('World Mode - UI persistence', () => {
    test('reload restores tier, selection, panel tab and map viewport', async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);

        // Drill into sistema_verne, select porto_verne, switch to Pistas.
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await page.locator('[data-entity-id="porto_verne"]').click();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
        await page.locator('[data-panel-tab="pistas"]').click();
        await expect(page.locator('[data-leads-panel]')).toBeVisible();

        // Pan the map: StarMap commits the viewport once the gesture ends and
        // the page remembers it under the tier key 'system:sistema_verne'.
        const svg = page.locator('svg[aria-label="Mapa del sector"]');
        const box = await svg.boundingBox();
        if (!box) throw new Error('mapa no visible');
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height - 60; // clear of nodes and overlays
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 140, startY + 25, { steps: 5 });
        await page.mouse.up();
        const transform = await svg.locator('> g').getAttribute('transform');
        expect(transform).not.toBeNull();

        // Reload: sessionStorage and OPFS survive; re-open through the hook.
        await page.reload();
        await openWorldViaOPFS(page);

        // Tier + panel tab restored (?e= deep-link navigation is skipped when
        // the persisted selection already matches — module doc "M5 polish").
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(page.locator('[data-leads-panel]')).toBeVisible();
        // The remembered per-tier viewport beats the fit-to-content compute.
        await expect(svg.locator('> g')).toHaveAttribute('transform', transform!);
        // The selection survived too.
        await page.locator('[data-panel-tab="entidad"]').click();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
    });
});

// ── M5: console lock-in ─────────────────────────────────────────────────────
//
// The world happy path must not emit ANY console error or warning: partyStore
// deliberately console.warns on misuse (log without session, double start...)
// and React warns on real bugs (keys, act, hydration), so new noise here is a
// regression. Either fix it or allowlist it BELOW with a justification.
//
// INSPECTED (M5, next dev + Chromium): the happy path currently emits ZERO
// error/warning-level messages — only `[log] [HMR] connected` and the React
// DevTools `[info]` ad, both below the filter. The entries here pre-allowlist
// dev-server tooling chatter whose console channel has shifted between Next
// versions; they are NOT app messages.
const CONSOLE_ALLOWLIST: RegExp[] = [
    // next dev (the e2e web server) Fast Refresh / HMR chatter.
    /\[Fast Refresh\]/,
    /\[HMR\]/,
    // React DevTools advertisement — printed by React development builds.
    /Download the React DevTools/,
];

test.describe('World Mode - Console hygiene', () => {
    test('happy path emits no console errors or warnings', async ({ page }) => {
        const issues: string[] = [];
        page.on('console', (message) => {
            const type = message.type();
            if (type !== 'error' && type !== 'warning') return;
            const text = message.text();
            if (CONSOLE_ALLOWLIST.some((pattern) => pattern.test(text))) return;
            issues.push(`[${type}] ${text}`);
        });
        page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));

        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);

        // Session + a quick-log write reaching OPFS.
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await page.locator('[data-quicklog="creditos"]').click();
        await page.locator('[data-quicklog-delta="100"]').click();
        await expect(page.locator('[data-party-bar] [data-creditos="1340"]')).toBeVisible();

        // Event draw + resolve.
        await page.locator('[data-quicklog="evento"]').click();
        const drawer = page.locator('[data-event-drawer]');
        await expect(drawer).toHaveAttribute('data-state', 'open');
        await drawer.locator('[data-event-outcome="ignorado"]').click();
        await expect(drawer).toHaveAttribute('data-state', 'closed');

        // ActRunner open + close (audio manager mount/unmount included).
        await openPortoVerneRunner(page);
        await page.locator('[data-act-close]').click();
        await expect(page.locator('[data-act-runner]')).toHaveCount(0);

        // End session (journal flush + forced estado write).
        await page.locator('[data-session-end]').click();
        await page.locator('[data-session-save]').click();
        await expect(page.locator('[data-session-start]')).toBeVisible();

        expect(issues).toEqual([]);
    });
});

// ── Profile images · player-safe fullscreen · pista detail (M6) ─────────────
//
// Player-safety is the headline: the GM projects the fullscreen viewer to the
// table, so [data-fullscreen-image] must contain the image and NOTHING ELSE
// (no title, no filename, no chrome) — every test below asserts its trimmed
// innerText is empty. The CON_ESTADO fixture carries mundo/imagenes/
// (kovar_iii.svg, kael_voss.svg), a pnj at porto_verne, a porto_verne act
// image (muelle_7.svg) and a pista with body + recompensa.

test.describe('World Mode - Perfiles, imagen segura y detalle de pistas', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN_CON_ESTADO);
        await openWorldViaOPFS(page);
    });

    /** Asserts the fullscreen overlay shows the image and no other visible content. */
    async function expectPlayerSafeFullscreen(page: import('@playwright/test').Page): Promise<void> {
        const overlay = page.locator('[data-fullscreen-image]');
        await expect(overlay).toBeVisible();
        // NOTHING but the image may reach the projected screen.
        expect((await overlay.innerText()).trim()).toBe('');
        await expect(overlay.locator('img')).toHaveCount(1);
        await expect(overlay.locator('button')).toHaveCount(0);
    }

    test('entity panel shows a profile thumbnail that opens the player-safe fullscreen', async ({ page }) => {
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await page.locator('[data-entity-id="kovar_iii"]').click();

        const panel = page.locator('[data-entity-panel="kovar_iii"]');
        await expect(panel).toBeVisible();
        const thumb = panel.locator('[data-entity-image]');
        await expect(thumb).toBeVisible();

        await thumb.click();
        await expectPlayerSafeFullscreen(page);
        // Projecting: the document is flagged so GM toasts are CSS-suppressed
        // (sonner renders above the overlay's z-index otherwise).
        await expect(page.locator('html[data-projecting]')).toHaveCount(1);

        // Closes on Escape and on a click on the overlay.
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-fullscreen-image]')).toHaveCount(0);
        await expect(page.locator('html[data-projecting]')).toHaveCount(0);
        await thumb.click();
        await page.locator('[data-fullscreen-image]').click();
        await expect(page.locator('[data-fullscreen-image]')).toHaveCount(0);
    });

    test('place panel lists Personajes and opens a PnjCard dossier', async ({ page }) => {
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await page.locator('[data-entity-id="porto_verne"]').click();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();

        // Kael Voss lives at porto_verne (ubicacion) -> Personajes link.
        await page.locator('[data-pnj-link="kael_voss"]').click();
        const card = page.locator('[data-pnj-card="kael_voss"]');
        await expect(card).toBeVisible();
        await expect(card).toContainText('quince anos en los muelles'); // dossier body

        // His portrait opens the same player-safe fullscreen.
        await card.locator('[data-entity-image]').click();
        await expectPlayerSafeFullscreen(page);
        await page.keyboard.press('Escape');

        // Back returns to the place panel.
        await card.locator('[data-pnj-back]').click();
        await expect(page.locator('[data-entity-panel="porto_verne"]')).toBeVisible();
    });

    test('ActRunner images display through the player-safe fullscreen (no filename leak)', async ({ page }) => {
        await openPortoVerneRunner(page);

        // The act carries muelle_7.svg -> its image tab renders the fullscreen viewer.
        await page.getByRole('tab', { name: 'muelle_7.svg' }).click();
        await expectPlayerSafeFullscreen(page);

        // Escape returns to the act without leaking the filename onto the screen.
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-fullscreen-image]')).toHaveCount(0);
        await expect(page.locator('[data-act-runner]')).toBeVisible();
    });

    test('pista row opens a detail view with body + recompensa; transitions do not', async ({ page }) => {
        // Session active so the transition journals a pista line.
        await page.locator('[data-session-start]').click();
        await expect(page.locator('[data-session-end]')).toBeVisible();
        await expect
            .poll(async () => (await listOPFSDir(page, 'mundo/diario')).length)
            .toBe(1);
        const [journalName] = await listOPFSDir(page, 'mundo/diario');
        const journalPath = `mundo/diario/${journalName}`;

        await page.locator('[data-panel-tab="pistas"]').click();
        const row = page.locator('[data-lead-id="deuda_kael_zara"]');
        await expect(row).toBeVisible();

        // A transition on the row must NOT open the detail (stopPropagation).
        await row.locator('[data-lead-transition="en_curso"]').click();
        await expect(page.locator('[data-lead-detail]')).toHaveCount(0);
        await expect(row).toHaveAttribute('data-lead-estado', 'en_curso');
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] pista: deuda_kael_zara activa->en_curso/);

        // Clicking the row body (data-lead-open is on the row itself) opens the
        // detail with the previously-invisible body. Corner click avoids the
        // interactive children (transition buttons / donde chip).
        await row.click({ position: { x: 5, y: 5 } });
        const detail = page.locator('[data-lead-detail="deuda_kael_zara"]');
        await expect(detail).toBeVisible();
        await expect(detail).toContainText('400 creditos'); // recompensa
        await expect(detail).toContainText('paquete'); // body text
        await expect(detail).toContainText('creditos>=800'); // requisito verbatim

        // Back returns to the list.
        await detail.locator('[data-lead-back]').click();
        await expect(page.locator('[data-leads-panel]')).toBeVisible();
        await expect(page.locator('[data-lead-detail]')).toHaveCount(0);
    });
});

test.describe('World Mode - Hilos de historia', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/world');
        await materializeIntoOPFS(page, MUNDO_CAMPAIGN);
        await openWorldViaOPFS(page);
    });

    test('Hilos tab lists tramas + pistas and paints/clears the focused thread web', async ({
        page,
    }) => {
        // Switch to the Hilos tab: both tramas listed, with a child pista visible.
        await page.locator('[data-panel-tab="hilos"]').click();
        const panel = page.locator('[data-hilos-panel]');
        await expect(panel).toBeVisible();
        await expect(panel.locator('[data-hilo-id="contrabando"]')).toBeVisible();
        await expect(panel.locator('[data-hilo-id="deudas"]')).toBeVisible();
        await expect(panel).toContainText('Contrabando');
        // A child pista of the trama is listed inside its card.
        await expect(
            page.locator('[data-hilo-id="contrabando"] [data-hilo-pista="ruta_franca"]')
        ).toBeVisible();

        // Nothing painted before focusing.
        await expect(page.locator('[data-thread-layer]')).toHaveCount(0);

        // Focus contrabando: its 2 lugares_clave resolve to two different sector
        // roots (sistema_verne + sistema_kessler) -> two thread-node markers.
        await page.locator('[data-hilo-focus="contrabando"]').click();
        const layer = page.locator('[data-thread-layer]');
        await expect(layer).toBeVisible();
        // Still at the sector tier (focusing drops there).
        await expect(page.locator('[data-tier="system"]')).toHaveCount(0);
        await expect(page.locator('[data-tier="place"]')).toHaveCount(0);
        await expect(layer.locator('[data-thread-node="sistema_verne"]')).toBeAttached();
        await expect(layer.locator('[data-thread-node="sistema_kessler"]')).toBeAttached();
        await expect(layer.locator('[data-thread-node]')).toHaveCount(2);

        // Toggle off (re-click the same trama) removes the layer.
        await page.locator('[data-hilo-focus="contrabando"]').click();
        await expect(page.locator('[data-thread-layer]')).toHaveCount(0);
    });
});
