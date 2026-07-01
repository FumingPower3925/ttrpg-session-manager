// Parser for the standardized "act" plan format (see nonstac/FORMATO_ACTOS.md).
//
// SCOPE COMES FROM NUMBERING, not from markdown heading level:
//   - a heading is a SECTION only if it starts with a bare number label ("5.", "C1", "A2");
//   - a heading is a SUBSECTION only if it starts with a numbered sub-identifier
//     ("2.2", "2.a", "2.A", "A2.1", "2A", "2.3.1");
//   - any other heading ("NODO A", "TABLA RESUMEN", "MOTOR DE COMPRENSIÓN") is just a
//     content heading whose blocks belong to the enclosing numbered section.
// This lets several labelled beats (e.g. the three nodes in "5.") live inside one section
// so their actions all stay visible while the GM scrolls between them.

export type ActBlockType = 'leer' | 'info' | 'gm' | 'accion' | 'recurso';

export interface ActField {
  key: string;
  value: string;
}

export interface ActBlock {
  type: ActBlockType;
  attrs: Record<string, string>;
  body: string;
  actScope: boolean;
  name?: string;
  fields?: ActField[];
}

export type ActItem =
  | { kind: 'block'; block: ActBlock }
  | { kind: 'heading'; text: string; level: 2 | 3 }
  | { kind: 'prose'; text: string };

export interface ActSection {
  id: string;
  label: string; // "5", "2A", "A2.1"
  title: string; // full heading text
  isSection: boolean; // true = top-level section, false = subsection
  parentId: string | null;
  content: ActItem[];
}

export interface ActModel {
  title: string;
  subtitle: string;
  preface: string;
  actBlocks: ActBlock[];
  sections: ActSection[];
}

const OPENER = /^:::(leer|info|gm|accion|recurso)(\{[^}]*\})?\s*$/;
const CLOSER = /^:::\s*$/;
// Optional single letter prefix (node id) + number, then optional sub-identifiers
// (".x" dotted segments or a trailing letter run). Must end on a boundary.
const LABEL_RE = /^([A-Za-z]?\d+)((?:\.[0-9A-Za-z]+|[A-Za-z]+)*)(?=[\s.\-—:)]|$)/;

export function isActFormat(content: string | null | undefined): boolean {
  return !!content && /^:::(leer|info|gm|accion|recurso)\b/m.test(content);
}

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw) return attrs;
  for (const part of raw.replace(/^\{/, '').replace(/\}$/, '').split(/[;,]/)) {
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
    if (field) fields.push({ key: field[1].toLowerCase(), value: field[2].trim() });
    else if (fields.length) fields[fields.length - 1].value += ' ' + stripped;
    else fields.push({ key: 'nota', value: stripped });
  }
  return { name, fields };
}

// Returns the label + its sub-identifier tokens, or null if the heading is not numbered.
function classifyLabel(title: string): { label: string; base: string; subs: string[] } | null {
  const m = title.match(LABEL_RE);
  if (!m) return null;
  const base = m[1];
  const rawSubs = m[2] || '';
  const subs = rawSubs.match(/\.[0-9A-Za-z]+|[A-Za-z]+/g) || [];
  return { label: base + rawSubs, base, subs };
}

// Ancestor labels, nearest first (for resolving a subsection's parent section).
function ancestorLabels(base: string, subs: string[]): string[] {
  const out: string[] = [];
  for (let i = subs.length - 1; i >= 0; i--) out.push(base + subs.slice(0, i).join(''));
  return out;
}

function slugify(label: string, index: number): string {
  return `s${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sec'}`;
}

export function parseAct(content: string): ActModel {
  const lines = content.split('\n');
  const model: ActModel = { title: '', subtitle: '', preface: '', actBlocks: [], sections: [] };
  const labelToId = new Map<string, string>();
  let current: ActSection | null = null;
  let inHeader = true;
  let proseBuf: string[] = [];

  const flushProse = () => {
    const text = proseBuf.join('\n').trim();
    proseBuf = [];
    if (!text) return;
    if (current) current.content.push({ kind: 'prose', text });
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
      while (i < lines.length && !CLOSER.test(lines[i])) bodyLines.push(lines[i++]);
      const body = bodyLines.join('\n').trim();
      const block: ActBlock = { type, attrs, body, actScope: attrs.ambito === 'acto' || current === null };
      if (type === 'accion') {
        const parsed = parseAccion(body);
        block.name = parsed.name;
        block.fields = parsed.fields;
      }
      if (block.actScope) model.actBlocks.push(block);
      else current!.content.push({ kind: 'block', block });
      i++;
      continue;
    }

    if (h3 || h2) {
      const level: 2 | 3 = h3 ? 3 : 2;
      const title = (h3 ? h3[1] : h2![1]).trim();
      const cls = classifyLabel(title);
      if (cls) {
        // Structural: a numbered section or subsection.
        flushProse();
        inHeader = false;
        const isSection = cls.subs.length === 0;
        let parentId: string | null = null;
        if (!isSection) {
          for (const anc of ancestorLabels(cls.base, cls.subs)) {
            const id = labelToId.get(anc);
            if (id) { parentId = id; break; }
          }
        }
        const sec: ActSection = {
          id: slugify(cls.label, model.sections.length),
          label: cls.label,
          title,
          isSection,
          parentId,
          content: [],
        };
        model.sections.push(sec);
        labelToId.set(cls.label, sec.id);
        current = sec;
      } else if (inHeader && level === 2) {
        // Non-numbered ## before any section = header subtitle metadata.
        model.subtitle += (model.subtitle ? ' · ' : '') + title;
      } else {
        // Non-numbered heading = plain content heading inside the current section.
        flushProse();
        if (current) current.content.push({ kind: 'heading', text: title, level });
        else model.preface += (model.preface ? '\n\n' : '') + (level === 2 ? '## ' : '### ') + title;
      }
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

export function sectionBlocks(section: ActSection): ActBlock[] {
  return section.content.filter((c): c is { kind: 'block'; block: ActBlock } => c.kind === 'block').map((c) => c.block);
}

// Blocks visible while `activeSectionId` is the section in view: that section's blocks,
// its ancestor sections' blocks (parent chain), and all act-scoped blocks.
export function visibleBlocks(model: ActModel, activeSectionId: string | null): ActBlock[] {
  const out: ActBlock[] = [...model.actBlocks];
  let cur = model.sections.find((s) => s.id === activeSectionId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(...sectionBlocks(cur));
    cur = cur.parentId ? model.sections.find((s) => s.id === cur!.parentId) : undefined;
  }
  return out;
}
