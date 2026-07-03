import { test, expect } from '@playwright/test';
import { MUNDO_CAMPAIGN, MUNDO_CAMPAIGN_CON_ESTADO } from './fixtures/mundoCampaign';
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
        await page.locator('[data-session-end-confirm-button]').click();
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
        // Intra-system hop: 1 flat day, no consumption (pips stay 2 -> 2).
        await expect(dialog.locator('[data-travel-total-dias="1"]')).toBeVisible();
        await expect(
            dialog.locator('[data-travel-medidor="combustible"][data-antes="2"][data-despues="2"]')
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

        // Full journal trail: rumbo -> dia -> llegada.
        await expect
            .poll(() => readOPFSFile(page, journalPath))
            .toMatch(/- \[\d{2}:\d{2}\] llegada: kovar_iii \| dia 4128/);
        const journal = await readOPFSFile(page, journalPath);
        expect(journal).toMatch(
            /- \[\d{2}:\d{2}\] rumbo: kovar_iii \| 1 dias, llegada estimada dia 4128/
        );
        expect(journal).toMatch(/- \[\d{2}:\d{2}\] dia: 4127->4128/);
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
        // porto_verne -> sistema_kessler: 1 intra day + ceil(√45)=7 sector days.
        await page.locator('[data-entity-id="sistema_kessler"]').click();
        const preview = page.locator('[data-route-preview]');
        await expect(preview).toBeVisible();
        await expect(preview).toContainText('8 días · −1 combustible');

        // System tier renders no routes layer -> the preview is gone.
        await page.locator('[data-entity-id="sistema_verne"]').dblclick();
        await expect(page.locator('[data-tier="system"]')).toBeAttached();
        await expect(page.locator('[data-route-preview]')).toHaveCount(0);
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
        await page.locator('[data-session-end-confirm-button]').click();
        await expect(page.locator('[data-session-start]')).toBeVisible();

        expect(issues).toEqual([]);
    });
});
