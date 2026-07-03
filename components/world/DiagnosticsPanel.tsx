'use client';

import type { ReactNode } from 'react';
import { ValidationIssue } from '@/types/world';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, CircleAlert, Copy, TriangleAlert } from 'lucide-react';

interface DiagnosticsPanelProps {
  problemas: ValidationIssue[];
  /** Copies the plain-text issue report (the app→agent bridge). */
  onCopyReport: () => void;
}

export function DiagnosticsPanel({ problemas, onCopyReport }: DiagnosticsPanelProps) {
  const errores = problemas.filter((issue) => issue.nivel === 'error');
  const avisos = problemas.filter((issue) => issue.nivel === 'aviso');

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden py-0" data-diagnostics-panel>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">Diagnóstico</CardTitle>
        <div className="text-sm text-muted-foreground">
          {problemas.length === 0
            ? 'Sin problemas detectados.'
            : `${errores.length} ${errores.length === 1 ? 'error' : 'errores'} · ${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}`}
        </div>
        <CardAction>
          <Button variant="outline" size="sm" onClick={onCopyReport}>
            <Copy />
            Copiar informe
          </Button>
        </CardAction>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="flex flex-col gap-4 py-4">
          {problemas.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
              El mundo se ha cargado sin errores ni avisos.
            </div>
          )}
          {errores.length > 0 && (
            <IssueList
              title={`Errores (${errores.length})`}
              icon={<CircleAlert className="size-4 text-destructive" aria-hidden />}
              items={errores}
            />
          )}
          {avisos.length > 0 && (
            <IssueList
              title={`Avisos (${avisos.length})`}
              icon={<TriangleAlert className="size-4 text-amber-500" aria-hidden />}
              items={avisos}
            />
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function IssueList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: ReactNode;
  items: ValidationIssue[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((issue, index) => (
          <li
            key={`${issue.archivo}-${index}`}
            className="rounded-md border p-2 text-sm"
            data-issue-level={issue.nivel}
          >
            <div className="font-mono text-xs break-all text-muted-foreground">{issue.archivo}</div>
            <div>{issue.mensaje}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
