'use client';

/**
 * ShopPanel — right-panel storefront view for a selected shop (feature — shop
 * system). Pure and props-driven, mirroring PnjCard/EntityPanel styling.
 *
 * Rendered by /world in place of the EntityPanel when the GM opens a shop from
 * the place panel's "Tiendas" section (page state `selectedShopId`, swapped the
 * same way selectedPnj swaps in PnjCard). The back button returns to the place.
 *
 * Each item row carries a "Comprar" button (data-shop-buy). Buying is
 * session-gated: `enabled=false` disables every button with the hint tooltip;
 * an item at stock 0 is also disabled (agotado). Unlimited stock (null) renders
 * as an infinity mark and never sells out.
 *
 * The price is NEGOTIABLE: each row shows an editable numeric input
 * (data-shop-price-input) defaulting to item.precio; the GM can adjust it and
 * Comprar charges the edited amount. A blank/NaN/negative input disables
 * Comprar (never journals NaN); zero is allowed (a freebie). Edits reset when
 * the shop changes or after a successful buy (keyed by the shop id + a bump
 * counter). When the edited price deviates from the base a subtle "base <n>"
 * hint appears.
 */

import { useEffect, useState } from 'react';
import type { Shop, ShopItem } from '@/types/world';
import { MarkdownViewer } from '@/components/play/MarkdownViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ShoppingCart, User } from 'lucide-react';

interface ShopPanelProps {
  shop: Shop;
  /** Display name of the shopkeeper pnj, pre-resolved (raw id as fallback). */
  pnjNombre?: string;
  /** Back to the place that owns the shop. */
  onBack: () => void;
  /**
   * Buy one unit of `item` at `precio` (the negotiated amount, which may differ
   * from item.precio). The page journals the gasto + decrements stock.
   */
  onBuy: (item: ShopItem, precio: number) => void;
  /** False without an active session: every Comprar disabled with a hint. */
  enabled: boolean;
}

const DISABLED_TITLE = 'Inicia sesión para comprar';

function stockLabel(stock: number | null): string {
  return stock === null ? '∞' : String(stock);
}

/** Parse an edited price field: a non-negative finite integer, else null. */
function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

export function ShopPanel({ shop, pnjNombre, onBack, onBuy, enabled }: ShopPanelProps) {
  const hasBody = shop.body.trim().length > 0;

  /**
   * Per-row edited price strings, keyed by item index. Reset whenever the shop
   * changes (a new id remounts the map values). Cleared for a row after a
   * successful buy so the field falls back to the item's base price.
   */
  const [edited, setEdited] = useState<Record<number, string>>({});
  useEffect(() => {
    setEdited({});
  }, [shop.id]);

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-shop-panel={shop.id}>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">{shop.nombre}</CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          {pnjNombre && (
            <Badge variant="secondary" className="gap-1" data-shop-keeper>
              <User className="size-3" aria-hidden />
              {pnjNombre}
            </Badge>
          )}
          {shop.etiquetas.map((etiqueta) => (
            <Badge key={etiqueta} variant="outline" className="text-muted-foreground">
              {etiqueta}
            </Badge>
          ))}
        </div>
        <CardAction>
          {/* min-h-11 = 44px tap target (M5 sweep). */}
          <Button
            variant="ghost"
            size="sm"
            data-shop-back
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
          {hasBody && <MarkdownViewer content={shop.body} className="prose-sm" />}

          {shop.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin artículos a la venta.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {shop.items.map((item, index) => {
                const agotado = item.stock === 0;
                const raw = edited[index] ?? String(item.precio);
                const precio = parsePrice(raw);
                const precioInvalido = precio === null;
                const negociado = precio !== null && precio !== item.precio;
                const buyDisabled = !enabled || agotado || precioInvalido;
                const title = !enabled
                  ? DISABLED_TITLE
                  : agotado
                    ? 'Sin existencias'
                    : precioInvalido
                      ? 'Introduce un precio válido'
                      : undefined;
                return (
                  <li
                    key={`${item.articulo}-${index}`}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-medium">{item.articulo}</span>
                        <span
                          className="shrink-0 text-xs text-muted-foreground tabular-nums"
                          data-shop-stock
                        >
                          x{stockLabel(item.stock)}
                        </span>
                      </div>
                      {item.nota && (
                        <p className="truncate text-xs text-muted-foreground">{item.nota}</p>
                      )}
                    </div>
                    {/* Editable / negotiable price: the input holds the current
                        per-row amount; the base hint shows the deviation. */}
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="flex items-center gap-1" data-shop-price>
                        <Input
                          data-shop-price-input={item.articulo}
                          inputMode="numeric"
                          value={raw}
                          onChange={(event) =>
                            setEdited((prev) => ({ ...prev, [index]: event.target.value }))
                          }
                          aria-label={`Precio de ${item.articulo}`}
                          aria-invalid={precioInvalido || undefined}
                          className="h-8 w-[6ch] px-1.5 text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">cr</span>
                      </span>
                      {negociado && (
                        <span
                          className="text-[10px] leading-none text-muted-foreground tabular-nums"
                          data-shop-price-base
                        >
                          base {item.precio.toLocaleString('es-ES')}
                        </span>
                      )}
                    </div>
                    {/* The disabled wrapper keeps the tooltip (Button sets
                        pointer-events-none when disabled). */}
                    <span title={title} className="shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-shop-buy={item.articulo}
                        disabled={buyDisabled}
                        onClick={() => {
                          if (precio === null) return;
                          onBuy(item, precio);
                          // Reset the row back to its base price after a buy.
                          setEdited((prev) => {
                            const next = { ...prev };
                            delete next[index];
                            return next;
                          });
                        }}
                        className="min-h-11"
                      >
                        <ShoppingCart aria-hidden />
                        Comprar
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
