'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseAct, visibleBlocks, sectionBlocks, ActBlock } from '@/lib/actFormat';
import {
  ScrollText,
  StickyNote,
  Dice5,
  Music,
  Image as ImageIcon,
  Pin,
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
        <Md>{block.body}</Md>
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

// Read-aloud: prominent box (this is what the GM reads out).
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

// GM guidance flowing inline in the center (NOT read aloud — how to run the beat).
function GmNote({ block }: { block: ActBlock }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/25 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <StickyNote className="h-3 w-3" /> Guía GM
      </div>
      <Md className="text-muted-foreground">{block.body}</Md>
    </div>
  );
}

interface ActPanelsProps {
  content: string;
  initialScrollTop?: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  /**
   * Player-safe view (screen-share). When true, the GM-only rails are omitted
   * from the DOM entirely — no :::gm reminders (left), no :::accion cards
   * (right), and no :::recurso cue chips / action-count hints in the center —
   * leaving only the :::leer / :::info read-aloud flow the players may see.
   * Default false → the full 3-panel GM view (byte-identical to before). /play
   * never passes this, so /play is unaffected.
   */
  playerView?: boolean;
}

export function ActPanels({
  content,
  initialScrollTop = 0,
  onScroll,
  playerView = false,
}: ActPanelsProps) {
  const model = useMemo(() => parseAct(content), [content]);
  const centerRef = useRef<HTMLDivElement>(null);
  const ticking = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(model.sections[0]?.id ?? null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Determine the active section by reading the DOM directly (no ref map, so a
  // re-render can't transiently empty it). Only update state when it changes.
  const recomputeActive = useCallback(() => {
    const root = centerRef.current;
    if (!root) return;
    const rootTop = root.getBoundingClientRect().top;
    const els = root.querySelectorAll<HTMLElement>('[data-section-id]');
    let active: string | null = els.length ? els[0].getAttribute('data-section-id') : null;
    for (const el of els) {
      if (el.getBoundingClientRect().top - rootTop <= 96) active = el.getAttribute('data-section-id');
      else break;
    }
    setActiveId((prev) => (prev === active ? prev : active));
  }, []);

  useEffect(() => {
    setActiveId(model.sections[0]?.id ?? null);
    const root = centerRef.current;
    if (root) root.scrollTop = initialScrollTop;
    requestAnimationFrame(recomputeActive);
    // initialScrollTop is intentionally excluded from deps: the parent updates it
    // on every scroll (it saves the position), and we must NOT reset the active
    // section on scroll — only when the content (model) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Publish the actions-rail width so fixed-position widgets (e.g. the timer) can
  // shift clear of it. Open = 20rem (w-80), collapsed = 2.25rem (w-9), unmounted = 0.
  // Player view has no rail at all, so it publishes 0.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--actions-rail-w',
      playerView ? '0px' : rightOpen ? '20rem' : '2.25rem'
    );
  }, [rightOpen, playerView]);
  useEffect(
    () => () => {
      document.documentElement.style.setProperty('--actions-rail-w', '0px');
    },
    []
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll?.(e);
    if (!ticking.current) {
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        recomputeActive();
      });
    }
  };

  const actReminders = model.actBlocks.filter((b) => b.type === 'gm');
  const actionBlocks = visibleBlocks(model, activeId).filter((b) => b.type === 'accion');
  const actLeer = model.actBlocks.filter((b) => b.type === 'leer' || b.type === 'info');
  const activeSection = model.sections.find((s) => s.id === activeId);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* LEFT RAIL — persistent act-level reminders (GM-only; omitted in player view) */}
      {!playerView &&
        (leftOpen ? (
        <aside className="w-72 shrink-0 border-r bg-muted/20 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Pin className="h-4 w-4" /> Recordatorios del acto
            </div>
            <button onClick={() => setLeftOpen(false)} title="Colapsar" className="text-muted-foreground hover:text-foreground">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-3 space-y-3 text-sm">
            {actReminders.length ? (
              actReminders.map((b, i) => (
                <div key={i} className="rounded-md border bg-background/60 p-2.5">
                  <Md>{b.body}</Md>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">— sin recordatorios de acto —</p>
            )}
          </div>
        </aside>
        ) : (
          <button
            onClick={() => setLeftOpen(true)}
            title="Recordatorios del acto"
            className="w-9 shrink-0 border-r bg-muted/20 flex items-start justify-center pt-3 text-muted-foreground hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ))}

      {/* CENTER — the scene flow: read-aloud + GM guidance inline, in order */}
      <div ref={centerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold">{model.title}</h1>
          {model.subtitle && <p className="text-muted-foreground mt-1">{model.subtitle}</p>}
          {model.preface && <Md className="mt-3 text-muted-foreground">{model.preface}</Md>}
          {actLeer.map((b, i) => (
            <div key={`al-${i}`} className="mt-3">
              <ReadAloud block={b} />
            </div>
          ))}

          {model.sections.map((s) => {
            const resources = sectionBlocks(s).filter((b) => b.type === 'recurso');
            const actionCount = sectionBlocks(s).filter((b) => b.type === 'accion').length;
            return (
              <section key={s.id} data-section-id={s.id} className="mt-8 scroll-mt-4">
                <h2 className={s.isSection ? 'text-xl font-bold border-b pb-1' : 'text-lg font-semibold text-muted-foreground'}>
                  {s.title}
                </h2>
                {!playerView && resources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resources.map((b, i) => (
                      <ResourceChip key={`r-${i}`} block={b} />
                    ))}
                  </div>
                )}
                <div className="mt-3 space-y-3">
                  {s.content.map((item, i) => {
                    if (item.kind === 'heading')
                      return (
                        <h3 key={i} className={item.level === 2 ? 'text-lg font-bold pt-2' : 'text-base font-semibold pt-1'}>
                          {item.text}
                        </h3>
                      );
                    if (item.kind === 'prose')
                      return (
                        <Md key={i} className="text-muted-foreground">
                          {item.text}
                        </Md>
                      );
                    const b = item.block;
                    if (b.type === 'recurso' || b.type === 'accion') return null;
                    // Section-scoped :::gm notes are GM answer-key too — a bare
                    // :::gm under a numbered heading parses as a section block and
                    // renders inline here. In player view they must be truly
                    // absent from the DOM so nothing leaks on the shared screen.
                    if (b.type === 'gm') return playerView ? null : <GmNote key={i} block={b} />;
                    return <ReadAloud key={i} block={b} />;
                  })}
                </div>
                {!playerView && actionCount > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground italic flex items-center gap-1">
                    <Dice5 className="h-3 w-3" /> {actionCount} acción(es) en el panel derecho →
                  </p>
                )}
              </section>
            );
          })}
          <div className="h-[40vh]" aria-hidden />
        </div>
      </div>

      {/* RIGHT RAIL — actions for the section in view (GM-only; omitted in player view) */}
      {!playerView &&
        (rightOpen ? (
        <aside className="w-80 shrink-0 border-l bg-muted/20 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground truncate">
              <Dice5 className="h-4 w-4 shrink-0" /> Acciones{activeSection ? ` · ${activeSection.title}` : ''}
            </div>
            <button onClick={() => setRightOpen(false)} title="Colapsar" className="text-muted-foreground hover:text-foreground shrink-0">
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
        ))}
    </div>
  );
}
