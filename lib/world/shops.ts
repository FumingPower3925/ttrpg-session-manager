/**
 * Shop parsing (feature — shop system). A shop lives at
 * `mundo/lugares/<place>/tiendas/<shop_id>.md`:
 *   - frontmatter: `tipo: tienda`, `nombre:`, `pnj: <id|null>`, `etiquetas: [...]`
 *   - body: GM prose, then a markdown table with EXACT headers
 *       | articulo | precio | stock | nota |
 *     `precio` is an integer, `stock` an integer ("-"/empty = unlimited/null),
 *     `nota` free text and optional.
 *
 * NEVER throws: malformed rows are skipped with an aviso, a missing/garbled
 * table yields an empty item list, and every problem degrades into a
 * ValidationIssue so the world always loads (same contract as worldScanner).
 */

import { Shop, ShopItem, ValidationIssue } from '@/types/world';
import { asString, asStringArray, normalizeKeys, parseFrontmatter } from './frontmatter';

/** Columns the parser understands, matched by header text (case-insensitive). */
const KNOWN_COLUMNS = ['articulo', 'precio', 'stock', 'nota'] as const;
type Column = (typeof KNOWN_COLUMNS)[number];

/** Splits one markdown table line into trimmed cells (drops the edge pipes). */
function splitRow(line: string): string[] {
    let inner = line.trim();
    if (inner.startsWith('|')) inner = inner.slice(1);
    if (inner.endsWith('|')) inner = inner.slice(0, -1);
    return inner.split('|').map((cell) => cell.trim());
}

/** A separator row is all dashes/colons/spaces between pipes (`|---|:--:|`). */
function isSeparatorRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * Parses `stock`: an integer, or null for "-"/"" (unlimited). Returns
 * `undefined` for anything else so the caller can skip the row as malformed.
 */
function parseStock(raw: string): number | null | undefined {
    const value = raw.trim();
    if (value === '' || value === '-') return null;
    const num = Number(value);
    return Number.isInteger(num) ? num : undefined;
}

/**
 * Parses the price-table rows after the `|---|` separator into ShopItems.
 * Columns are located by header position (articulo/precio/stock/nota); a row
 * with a non-integer precio, a bad stock, or an empty articulo is skipped with
 * an aviso instead of crashing. Returns [] when no valid table is present.
 */
function parseItems(
    lines: string[],
    filePath: string,
    issues: ValidationIssue[]
): ShopItem[] {
    // Locate the header row: the first table-looking line whose cells include
    // an `articulo` column, immediately followed by a separator row.
    let headerIdx = -1;
    let columns: (Column | null)[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('|')) continue;
        const cells = splitRow(line).map((cell) => cell.toLowerCase());
        if (isSeparatorRow(splitRow(line))) continue;
        const mapped = cells.map((cell) =>
            (KNOWN_COLUMNS as readonly string[]).includes(cell) ? (cell as Column) : null
        );
        if (!mapped.includes('articulo')) continue;
        const next = lines[i + 1];
        if (next === undefined || !isSeparatorRow(splitRow(next))) continue;
        headerIdx = i;
        columns = mapped;
        break;
    }

    if (headerIdx === -1) return [];

    const col = (name: Column): number => columns.indexOf(name);
    const articuloIdx = col('articulo');
    const precioIdx = col('precio');
    const stockIdx = col('stock');
    const notaIdx = col('nota');

    const items: ShopItem[] = [];
    // Rows start two lines after the header (header + separator).
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim().startsWith('|')) break; // table ended
        const cells = splitRow(line);
        if (isSeparatorRow(cells)) continue;

        const articulo = (cells[articuloIdx] ?? '').trim();
        const precioRaw = precioIdx >= 0 ? (cells[precioIdx] ?? '').trim() : '';
        const precio = Number(precioRaw);
        const stock = stockIdx >= 0 ? parseStock(cells[stockIdx] ?? '') : null;
        const nota = notaIdx >= 0 ? (cells[notaIdx] ?? '').trim() : '';

        if (articulo === '' || !Number.isInteger(precio) || stock === undefined) {
            issues.push({
                nivel: 'aviso',
                archivo: filePath,
                mensaje: `Fila de tienda mal formada (se omite): "${line.trim()}"`,
            });
            continue;
        }

        items.push({
            articulo,
            precio,
            stock,
            ...(nota ? { nota } : {}),
        });
    }

    return items;
}

/**
 * Parses one shop markdown file into a Shop + its ValidationIssues. Never
 * throws. `id` is the filename without extension; `filePath` is
 * campaign-relative. The shopkeeper `pnj` is carried through raw — the scanner
 * validates it resolves against the entity map (this parser has no world view).
 */
export function parseShop(
    content: string,
    filePath: string,
    id: string
): { shop: Shop; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    const parsed = parseFrontmatter(content, filePath);
    if (parsed.issue) issues.push(parsed.issue);
    const data = normalizeKeys(parsed.data);

    const nombre = asString(data.nombre) ?? id;
    // `pnj: null` (or absent) leaves the shop keeper-less.
    const pnj = asString(data.pnj);
    const etiquetas = asStringArray(data.etiquetas);

    const bodyLines = parsed.body.split(/\r?\n/);
    const items = parseItems(bodyLines, filePath, issues);
    // GM prose = everything above the first table line (best-effort; the panel
    // shows it as context). Falls back to the whole body when there is no table.
    const firstTableLine = bodyLines.findIndex(
        (line, i) =>
            line.includes('|') &&
            !isSeparatorRow(splitRow(line)) &&
            bodyLines[i + 1] !== undefined &&
            isSeparatorRow(splitRow(bodyLines[i + 1]))
    );
    const body =
        firstTableLine === -1
            ? parsed.body.trim()
            : bodyLines.slice(0, firstTableLine).join('\n').trim();

    return {
        shop: {
            id,
            nombre,
            ...(pnj ? { pnj } : {}),
            etiquetas,
            items,
            body,
            filePath,
        },
        issues,
    };
}
