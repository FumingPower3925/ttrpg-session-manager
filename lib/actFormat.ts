// Parser for the standardized "act" plan format (see nonstac/FORMATO_ACTOS.md).
// Splits a plan markdown file into scoped sections + typed blocks so the play UI
// can render read-aloud (center), GM notes (left rail) and actions (right rail),
// updating by the section in view while parent-section and act-level blocks persist.

export type ActBlockType = 'leer' | 'info' | 'gm' | 'accion' | 'recurso';

export interface ActField {
  key: string; // check | exito | exito-critico | fallo | fallo-critico | mod | coste | nota
  value: string;
}

export interface ActBlock {
  type: ActBlockType;
  attrs: Record<string, string>;
  body: string; // markdown body (raw for recurso)
  actScope: boolean; // shown across the whole act
  // accion-only:
  name?: string;
  fields?: ActField[];
}

export interface ActSection {
  id: string;
  level: 2 | 3;
  title: string;
  parentId: string | null; // for level-3 subsections, the parent level-2 section id
  prose: string; // neutral prose under this heading
  blocks: ActBlock[]; // non-act-scoped blocks under this heading
}

export interface ActModel {
  title: string;
  subtitle: string; // header subtitle lines (e.g. "Sesión 7 …", "Duración …")
  preface: string;
  actBlocks: ActBlock[]; // {ambito=acto} or before the first section — persist everywhere
  sections: ActSection[];
}

const OPENER = /^:::(leer|info|gm|accion|recurso)(\{[^}]*\})?\s*$/;
const CLOSER = /^:::\s*$/;

export function isActFormat(content: string | null | undefined): boolean {
  return !!content && /^:::(leer|info|gm|accion|recurso)\b/m.test(content);
}

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw) return attrs;
  const inner = raw.replace(/^\{/, '').replace(/\}$/, '');
  for (const part of inner.split(/[;,]/)) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k) attrs[k] = v ?? 'true';
  }
  return attrs;
}

function parseAccion(body: string): { name?: string; fields: ActField[] } {
  const fields: ActField[] = [];
  let name: string | undefined;
  for (const rawLine of body.split('\n')) {
    const t = rawLine.trim();
    if (!t) continue;
    const bold = t.match(/^\*\*(.+?)\*\*\s*$/);
    if (bold && !name) {
      name = bold[1].trim();
      continue;
    }
    const stripped = t.replace(/^[-*]\s*/, '');
    const field = stripped.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ][\wÁÉÍÓÚÑáéíóúñ-]*)\s*:\s*(.+)$/);
    if (field) {
      fields.push({ key: field[1].toLowerCase(), value: field[2].trim() });
    } else if (fields.length) {
      fields[fields.length - 1].value += ' ' + stripped;
    } else {
      fields.push({ key: 'nota', value: stripped });
    }
  }
  return { name, fields };
}

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `s${index}-${base || 'sec'}`;
}

export function parseAct(content: string): ActModel {
  const lines = content.split('\n');
  const model: ActModel = { title: '', subtitle: '', preface: '', actBlocks: [], sections: [] };
  let currentSection: ActSection | null = null;
  let currentH2: ActSection | null = null;
  let inHeader = true; // header zone: title + subtitle lines, before the first block/section
  let proseBuf: string[] = [];

  const flushProse = () => {
    const text = proseBuf.join('\n').trim();
    proseBuf = [];
    if (!text) return;
    if (currentSection) currentSection.prose += (currentSection.prose ? '\n\n' : '') + text;
    else model.preface += (model.preface ? '\n\n' : '') + text;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(OPENER);
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);

    if (open) {
      flushProse();
      inHeader = false;
      const type = open[1] as ActBlockType;
      const attrs = parseAttrs(open[2]);
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && !CLOSER.test(lines[i])) {
        bodyLines.push(lines[i]);
        i++;
      }
      const body = bodyLines.join('\n').trim();
      const actScope = attrs.ambito === 'acto' || currentSection === null;
      const block: ActBlock = { type, attrs, body, actScope };
      if (type === 'accion') {
        const parsed = parseAccion(body);
        block.name = parsed.name;
        block.fields = parsed.fields;
      }
      if (actScope) model.actBlocks.push(block);
      else currentSection!.blocks.push(block);
      i++; // consume closer
      continue;
    }

    if (h3) {
      flushProse();
      inHeader = false;
      const sec: ActSection = {
        id: slugify(h3[1], model.sections.length),
        level: 3,
        title: h3[1].trim(),
        parentId: currentH2 ? currentH2.id : null,
        prose: '',
        blocks: [],
      };
      model.sections.push(sec);
      currentSection = sec;
      i++;
      continue;
    }
    if (h2) {
      const title = h2[1].trim();
      // In the header zone, non-numbered ## lines are subtitle metadata, not sections.
      if (inHeader && !/^\d/.test(title)) {
        model.subtitle += (model.subtitle ? ' · ' : '') + title;
        i++;
        continue;
      }
      flushProse();
      inHeader = false;
      const sec: ActSection = {
        id: slugify(title, model.sections.length),
        level: 2,
        title,
        parentId: null,
        prose: '',
        blocks: [],
      };
      model.sections.push(sec);
      currentSection = sec;
      currentH2 = sec;
      i++;
      continue;
    }
    if (h1) {
      model.title = h1[1].trim();
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      i++;
      continue;
    }
    proseBuf.push(line);
    i++;
  }
  flushProse();
  return model;
}

// Blocks visible while `activeSectionId` is in view: the active section's blocks,
// its parent section's blocks (if it's a subsection), and all act-scoped blocks.
export function visibleBlocks(model: ActModel, activeSectionId: string | null): ActBlock[] {
  const out: ActBlock[] = [...model.actBlocks];
  const active = model.sections.find((s) => s.id === activeSectionId);
  if (active) {
    if (active.parentId) {
      const parent = model.sections.find((s) => s.id === active.parentId);
      if (parent) out.push(...parent.blocks);
    }
    out.push(...active.blocks);
  }
  return out;
}
