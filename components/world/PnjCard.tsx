'use client';

/**
 * PnjCard — right-panel dossier view for a selected PNJ (GM-only).
 *
 * Rendered by /world in place of the EntityPanel when the selection is a pnj
 * (pnjs ARE entities in the entidades map — the page reuses selectedEntityId,
 * see the page module doc). Reached from the "Personajes" section of a place
 * panel (or search / ?e= deep link); the back button returns to the pnj's
 * ubicacion place.
 *
 * Portrait: same EntityImageBanner + player-safe FullscreenImage behavior as
 * the EntityPanel thumbnail when the pnj carries `imagen`.
 */

import type { FileReference } from '@/types';
import type { Conocimiento, NpcEntity } from '@/types/world';
import { EntityImageBanner } from '@/components/world/EntityPanel';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft } from 'lucide-react';

const CONOCIMIENTO_LABEL: Record<Conocimiento, string> = {
  desconocido: 'Desconocido',
  rumoreado: 'Rumoreado',
  conocido: 'Conocido',
  visitado: 'Visitado',
};

interface PnjCardProps {
  pnj: NpcEntity;
  /** Display name of the pnj's faccion, pre-resolved (raw id as fallback). */
  faccionNombre?: string;
  /** Resolves the portrait to an object URL (page-owned cache). */
  loadImageUrl?: (ref: FileReference) => Promise<string>;
  /** Opens the player-safe FullscreenImage viewer with a resolved URL. */
  onImageZoom?: (url: string) => void;
  /** Back to where the pnj lives (its ubicacion place panel). */
  onBack: () => void;
}

export function PnjCard({ pnj, faccionNombre, loadImageUrl, onImageZoom, onBack }: PnjCardProps) {
  const hasBody = pnj.body.trim().length > 0;

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-pnj-card={pnj.id}>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">{pnj.nombre}</CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{pnj.rol}</Badge>
          {faccionNombre && <Badge variant="outline">{faccionNombre}</Badge>}
          <Badge variant="outline">{CONOCIMIENTO_LABEL[pnj.conocimiento]}</Badge>
        </div>
        <CardAction>
          {/* size/min-h 11 = 44px tap target (M5 sweep). */}
          <Button
            variant="ghost"
            size="sm"
            data-pnj-back
            onClick={onBack}
            aria-label="Volver al lugar"
            className="min-h-11"
          >
            <ArrowLeft />
            Volver
          </Button>
        </CardAction>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="flex flex-col gap-4 py-4">
          {pnj.imagen && loadImageUrl && onImageZoom && (
            <EntityImageBanner
              imagen={pnj.imagen}
              nombre={pnj.nombre}
              loadImageUrl={loadImageUrl}
              onZoom={onImageZoom}
            />
          )}

          {pnj.resumen && <p className="text-sm text-muted-foreground">{pnj.resumen}</p>}

          {pnj.estado && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Situación
              </div>
              <p className="text-sm whitespace-pre-line">{pnj.estado}</p>
            </div>
          )}

          {hasBody && <MarkdownViewer content={pnj.body} className="prose-sm" />}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
