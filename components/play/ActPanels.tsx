'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseAct, visibleBlocks, ActBlock } from '@/lib/actFormat';
import {
  ScrollText,
  StickyNote,
  Dice5,
  Music,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

function Md({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`prose prose-sm prose-neutral dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  check: 'Tirada',
  exito: 'Éxito',
  'exito-critico': 'Éxito crítico',
  fallo: 'Fallo',
  'fallo-critico': 'Fallo crítico',
  mod: 'Modificador',
  coste: 'Coste',
  nota: 'Nota',
};
const FIELD_CLASS: Record<string, string> = {
  check: 'text-foreground font-medium',
  exito: 'text-emerald-600 dark:text-emerald-400',
  'exito-critico': 'text-emerald-700 dark:text-emerald-300 font-medium',
  fallo: 'text-amber-600 dark:text-amber-400',
  'fallo-critico': 'text-red-600 dark:text-red-400',
  mod: 'text-muted-foreground',
  coste: 'text-amber-600 dark:text-amber-400',
  nota: 'text-muted-foreground',
};

function ActionCard({ block }: { block: ActBlock }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm space-y-2">
      {block.name && (
        <div className="font-semibold flex items-center gap-1.5">
          <Dice5 className="h-4 w-4 text-primary shrink-0" />
          <span>{block.name}</span>
        </div>
      )}
      {block.fields && block.fields.length > 0 ? (
        <dl className="space-y-1.5">
          {block.fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[5.5rem_1fr] gap-x-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">
                {FIELD_LABEL[f.key] ?? f.key}
              </dt>
              <dd className={`leading-snug ${FIELD_CLASS[f.key] ?? ''}`}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Md className="prose-xs">{block.body}</Md>
      )}
    </div>
  );
}

function ResourceChip({ block }: { block: ActBlock }) {
  const isMusic = block.attrs.tipo === 'musica';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
      {isMusic ? <Music className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
      {block.body}
    </span>
  );
}

interface ActPanelsProps {
  content: string;
  initialScrollTop?: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function ActPanels({ content, initialScrollTop = 0, onScroll }: ActPanelsProps) {
  const model = useMemo(() => parseAct(content), [content]);
  const centerRef = useRef<HTMLDivElement>(null);
  const sectionEls = useRef<Map<string, HTMLElement>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(model.sections[0]?.id ?? null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const recomputeActive = useCallback(() => {
    const root = centerRef.current;
    if (!root) return;
    const rootTop = root.getBoundingClientRect().top;
    let active: string | null = model.sections[0]?.id ?? null;
    for (const s of model.sections) {
      const el = sectionEls.current.get(s.id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top - rootTop;
      if (top <= 96) active = s.id;
      else break;
    }
    setActiveId(active);
  }, [model]);

  useEffect(() => {
    setActiveId(model.sections[0]?.id ?? null);
    const root = centerRef.current;
    if (root) root.scrollTop = initialScrollTop;
    requestAnimationFrame(recomputeActive);
  }, [model, initialScrollTop, recomputeActive]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    recomputeActive();
    onScroll?.(e);
  };

  const visible = visibleBlocks(model, activeId);
  const gmBlocks = visible.filter((b) => b.type === 'gm');
  const actionBlocks = visible.filter((b) => b.type === 'accion');
  const actLeer = model.actBlocks.filter((b) => b.type === 'leer' || b.type === 'info');
  const activeSection = model.sections.find((s) => s.id === activeId);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* LEFT RAIL — GM notes */}
      {leftOpen ? (
        <aside className="w-72 shrink-0 border-r bg-muted/20 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <StickyNote className="h-4 w-4" /> Notas GM
            </div>
            <button onClick={() => setLeftOpen(false)} title="Colapsar" className="text-muted-foreground hover:text-foreground">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-3 space-y-3 text-sm">
            {gmBlocks.length ? (
              gmBlocks.map((b, i) => (
                <div key={i} className="rounded-md border bg-background/60 p-2.5">
                  <Md>{b.body}</Md>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">— sin notas para esta sección —</p>
            )}
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setLeftOpen(true)}
          title="Notas GM"
          className="w-9 shrink-0 border-r bg-muted/20 flex items-start justify-center pt-3 text-muted-foreground hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* CENTER — read-aloud */}
      <div ref={centerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold">{model.title}</h1>
          {model.subtitle && <p className="text-muted-foreground mt-1">{model.subtitle}</p>}
          {model.preface && <Md className="mt-3">{model.preface}</Md>}
          {actLeer.length > 0 && (
            <div className="mt-4 space-y-3">
              {actLeer.map((b, i) => (
                <ReadAloud key={i} block={b} />
              ))}
            </div>
          )}

          {model.sections.map((s) => {
            const resources = s.blocks.filter((b) => b.type === 'recurso');
            const readables = s.blocks.filter((b) => b.type === 'leer' || b.type === 'info');
            return (
              <section
                key={s.id}
                data-section-id={s.id}
                ref={(el) => {
                  if (el) sectionEls.current.set(s.id, el);
                  else sectionEls.current.delete(s.id);
                }}
                className="mt-8 scroll-mt-4"
              >
                <h2 className={s.level === 3 ? 'text-lg font-semibold text-muted-foreground' : 'text-xl font-bold border-b pb-1'}>
                  {s.title}
                </h2>
                {resources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resources.map((b, i) => (
                      <ResourceChip key={i} block={b} />
                    ))}
                  </div>
                )}
                {s.prose && <Md className="mt-2 text-muted-foreground">{s.prose}</Md>}
                <div className="mt-3 space-y-3">
                  {readables.map((b, i) => (
                    <ReadAloud key={i} block={b} />
                  ))}
                </div>
              </section>
            );
          })}
          <div className="h-[40vh]" aria-hidden />
        </div>
      </div>

      {/* RIGHT RAIL — actions */}
      {rightOpen ? (
        <aside className="w-80 shrink-0 border-l bg-muted/20 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Dice5 className="h-4 w-4" /> Acciones{activeSection ? ` · ${activeSection.title}` : ''}
            </div>
            <button onClick={() => setRightOpen(false)} title="Colapsar" className="text-muted-foreground hover:text-foreground">
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-3 space-y-3">
            {actionBlocks.length ? (
              actionBlocks.map((b, i) => <ActionCard key={i} block={b} />)
            ) : (
              <p className="text-muted-foreground text-xs">— sin acciones para esta sección —</p>
            )}
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setRightOpen(true)}
          title="Acciones"
          className="w-9 shrink-0 border-l bg-muted/20 flex items-start justify-center pt-3 text-muted-foreground hover:text-foreground"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ReadAloud({ block }: { block: ActBlock }) {
  const isInfo = block.type === 'info';
  return (
    <div
      className={`rounded-lg border-l-4 p-3 ${
        isInfo ? 'border-l-muted-foreground/40 bg-muted/30' : 'border-l-primary bg-primary/5'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <ScrollText className="h-3 w-3" />
        {isInfo ? 'Si preguntan' : 'Leer en voz alta'}
      </div>
      <Md>{block.body}</Md>
    </div>
  );
}
