'use client';

import type { ReactNode } from 'react';
import { Conocimiento, Lead, PlaceEntity, WorldEntityBase } from '@/types/world';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, X, ZoomIn } from 'lucide-react';

const CONOCIMIENTO_LABEL: Record<Conocimiento, string> = {
  desconocido: 'Desconocido',
  rumoreado: 'Rumoreado',
  conocido: 'Conocido',
  visitado: 'Visitado',
};

const ESTADO_PISTA_LABEL: Record<Lead['estadoPista'], string> = {
  rumor: 'Rumor',
  activa: 'Activa',
  en_curso: 'En curso',
  resuelta: 'Resuelta',
  fallida: 'Fallida',
};

const ACCESO_LABEL: Record<NonNullable<PlaceEntity['acceso']>, string> = {
  normal: 'Acceso normal',
  portal: 'Portal',
  restringido: 'Restringido',
};

/** Any world entity; place-specific fields render when present. */
export type EntityPanelEntity = WorldEntityBase &
  Partial<Pick<PlaceEntity, 'servicios' | 'facciones' | 'acceso' | 'peligro' | 'en' | 'orbita'>>;

export interface EntityPanelLead {
  id: string;
  nombre: string;
  estadoPista: Lead['estadoPista'];
  accionable: boolean | 'manual';
}

interface EntityPanelProps {
  entity: EntityPanelEntity;
  /** Display names of the entity's children (`en:` inverse), pre-resolved. */
  childNames: string[];
  /** Display names of factions present at the entity, pre-resolved. */
  factionNames: string[];
  leads: EntityPanelLead[];
  onDrillIn?: () => void;
  onClose: () => void;
  /** Page-provided action buttons (Viajar / Entrar / Jugar). */
  actions?: ReactNode;
}

export function EntityPanel({
  entity,
  childNames,
  factionNames,
  leads,
  onDrillIn,
  onClose,
  actions,
}: EntityPanelProps) {
  const hasBody = entity.body.trim().length > 0;
  const hasFooter = Boolean(onDrillIn) || Boolean(actions);

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-entity-panel={entity.id}>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">{entity.nombre}</CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{entity.tipo}</Badge>
          <Badge variant="outline">{CONOCIMIENTO_LABEL[entity.conocimiento]}</Badge>
          {entity.acceso && entity.acceso !== 'normal' && (
            <Badge variant="outline">{ACCESO_LABEL[entity.acceso]}</Badge>
          )}
          {entity.peligro !== undefined && (
            <Badge variant="outline">Peligro {entity.peligro}/5</Badge>
          )}
        </div>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar panel">
            <X />
          </Button>
        </CardAction>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="flex flex-col gap-4 py-4">
          {entity.etiquetas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entity.etiquetas.map((etiqueta) => (
                <Badge key={etiqueta} variant="outline" className="text-muted-foreground">
                  {etiqueta}
                </Badge>
              ))}
            </div>
          )}

          {entity.servicios && entity.servicios.length > 0 && (
            <Section title="Servicios">
              <div className="flex flex-wrap gap-1">
                {entity.servicios.map((servicio) => (
                  <Badge key={servicio} variant="secondary">
                    {servicio}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {factionNames.length > 0 && (
            <Section title="Facciones">
              <div className="flex flex-wrap gap-1">
                {factionNames.map((nombre) => (
                  <Badge key={nombre} variant="outline">
                    {nombre}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {entity.resumen && <p className="text-sm text-muted-foreground">{entity.resumen}</p>}

          {entity.estado && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Situación
              </div>
              <p className="text-sm whitespace-pre-line">{entity.estado}</p>
            </div>
          )}

          {hasBody && <MarkdownViewer content={entity.body} className="prose-sm" />}

          {leads.length > 0 && (
            <Section title="Pistas">
              <ul className="flex flex-col gap-1.5">
                {leads.map((lead) => (
                  <li key={lead.id} className="flex items-center gap-2 text-sm">
                    {lead.accionable === true && (
                      <Star
                        className="size-3.5 shrink-0 fill-amber-400 text-amber-500"
                        aria-label="Accionable"
                      />
                    )}
                    <span className="min-w-0 truncate">{lead.nombre}</span>
                    <Badge
                      variant={lead.estadoPista === 'fallida' ? 'destructive' : 'outline'}
                      className="ml-auto shrink-0"
                    >
                      {ESTADO_PISTA_LABEL[lead.estadoPista]}
                    </Badge>
                    {lead.accionable === 'manual' && (
                      <span className="shrink-0 text-xs text-muted-foreground">según GM</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {childNames.length > 0 && (
            <Section title="Contiene">
              <ul className="flex flex-col gap-1 text-sm">
                {childNames.map((nombre) => (
                  <li key={nombre} className="truncate">
                    {nombre}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </CardContent>
      </ScrollArea>

      {hasFooter && (
        <div className="flex items-center gap-2 border-t p-3">
          {onDrillIn && (
            <Button variant="outline" size="sm" onClick={onDrillIn}>
              <ZoomIn />
              Entrar
            </Button>
          )}
          {actions}
        </div>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}
