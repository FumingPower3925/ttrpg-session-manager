'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { FileReference } from '@/types';
import { Conocimiento, Lead, NpcEntity, PlaceEntity, WorldEntityBase } from '@/types/world';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, User, X, ZoomIn } from 'lucide-react';

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

/** One row of the "Personajes" section: a pnj whose ubicacion is the entity. */
export interface EntityPanelPersonaje {
  id: string;
  nombre: string;
  rol: NpcEntity['rol'];
  /** True when the party has not met the pnj yet (conocimiento desconocido). */
  desconocido: boolean;
}

/**
 * Rounded profile-image banner shared by EntityPanel and PnjCard: resolves
 * the object URL through the page-owned cache (loadImageUrl) and opens the
 * player-safe FullscreenImage viewer through onZoom. Renders nothing until
 * the URL resolves (and nothing at all on a failed load).
 */
export function EntityImageBanner({
  imagen,
  nombre,
  loadImageUrl,
  onZoom,
}: {
  imagen: FileReference;
  nombre: string;
  loadImageUrl: (ref: FileReference) => Promise<string>;
  onZoom: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    loadImageUrl(imagen).then(
      (resolved) => {
        if (!cancelled) setUrl(resolved);
      },
      (error) => {
        console.error(`Error al cargar la imagen ${imagen.path}:`, error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [imagen, loadImageUrl]);

  if (url === null) return null;

  return (
    <button
      type="button"
      aria-label={`Ampliar imagen de ${nombre}`}
      className="block w-full cursor-zoom-in"
      onClick={() => onZoom(url)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
      <img
        src={url}
        alt=""
        data-entity-image
        className="max-h-40 w-full rounded-lg object-cover"
      />
    </button>
  );
}

interface EntityPanelProps {
  entity: EntityPanelEntity;
  /** Display names of the entity's children (`en:` inverse), pre-resolved. */
  childNames: string[];
  /** Display names of factions present at the entity, pre-resolved. */
  factionNames: string[];
  leads: EntityPanelLead[];
  /**
   * Pistas at DESCENDANT places (for containers: sistemas / places with
   * children) — matches the map badge, which also counts the interior.
   */
  interiorLeads?: EntityPanelLead[];
  /** True when the entity is the party's current location ("Estáis aquí"). */
  isCurrentLocation?: boolean;
  /**
   * Pnjs located AT the entity (ubicacion === entity.id) — GM-only view, so
   * ALL of them list, with a muted "(desconocido)" hint on the unmet ones.
   */
  personajes?: EntityPanelPersonaje[];
  /** Click on a personaje row — the page switches the panel to its PnjCard. */
  onSelectPnj?: (id: string) => void;
  /** Resolves an entity image to an object URL (page-owned cache). */
  loadImageUrl?: (ref: FileReference) => Promise<string>;
  /** Opens the player-safe FullscreenImage viewer with a resolved URL. */
  onImageZoom?: (url: string) => void;
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
  interiorLeads = [],
  isCurrentLocation = false,
  personajes = [],
  onSelectPnj,
  loadImageUrl,
  onImageZoom,
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
          {isCurrentLocation && (
            // Same badge language as the SiteList's current-location row.
            <Badge data-entity-current>Estáis aquí</Badge>
          )}
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
          {/* size-11 = 44px tap target (M5 sweep). */}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel" className="size-11">
            <X />
          </Button>
        </CardAction>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="flex flex-col gap-4 py-4">
          {entity.imagen && loadImageUrl && onImageZoom && (
            <EntityImageBanner
              imagen={entity.imagen}
              nombre={entity.nombre}
              loadImageUrl={loadImageUrl}
              onZoom={onImageZoom}
            />
          )}

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
              <LeadList leads={leads} />
            </Section>
          )}

          {interiorLeads.length > 0 && (
            <Section title="Pistas en el interior">
              <LeadList leads={interiorLeads} />
            </Section>
          )}

          {personajes.length > 0 && onSelectPnj && (
            <Section title="Personajes">
              <ul className="flex flex-col gap-1">
                {personajes.map((pnj) => (
                  <li key={pnj.id}>
                    <button
                      type="button"
                      data-pnj-link={pnj.id}
                      onClick={() => onSelectPnj(pnj.id)}
                      // min-h-11 = 44px tap target (M5 sweep).
                      className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <User className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">{pnj.nombre}</span>
                      {pnj.desconocido && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          (desconocido)
                        </span>
                      )}
                      <Badge variant="outline" className="ml-auto shrink-0 text-muted-foreground">
                        {pnj.rol}
                      </Badge>
                    </button>
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
            <Button variant="outline" size="sm" onClick={onDrillIn} className="min-h-11">
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

function LeadList({ leads }: { leads: EntityPanelLead[] }) {
  return (
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
