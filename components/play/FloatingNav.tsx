'use client';

import { Part, PathDef } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, GitBranch } from 'lucide-react';

interface FloatingNavProps {
  parts: Part[];
  currentPartId: string | null;
  onPartChange: (partId: string) => void;
  isCompact?: boolean;
  paths?: PathDef[];
  activePathId?: string | null;
  onPathChange?: (pathId: string | null) => void;
}

export function FloatingNav({
  parts,
  currentPartId,
  onPartChange,
  isCompact = false,
  paths = [],
  activePathId = null,
  onPathChange,
}: FloatingNavProps) {
  const currentPart = parts.find(p => p.id === currentPartId);
  const activePath = paths.find(p => p.id === activePathId) ?? null;
  const hasPaths = paths.length > 0;

  return (
    <div
      className="fixed top-4 left-4 z-40 transition-all duration-300 ease-in-out flex items-center gap-2"
      style={{
        opacity: isCompact ? 0 : 1,
        transform: isCompact ? 'translateY(-100%)' : 'translateY(0)',
        pointerEvents: isCompact ? 'none' : 'auto'
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="min-w-[200px] justify-between">
            <span className="truncate">
              {currentPart ? currentPart.name : 'Select a part'}
            </span>
            <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          {parts.map((part) => (
            <DropdownMenuItem
              key={part.id}
              onClick={() => onPartChange(part.id)}
              className={currentPartId === part.id ? 'bg-accent' : ''}
            >
              {part.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Path switcher: subtle affordance to change/reset the active path */}
      {hasPaths && onPathChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="justify-between gap-2">
              <GitBranch className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[140px]">
                {activePath ? activePath.name : 'No path'}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Active path</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onPathChange(null)}
              className={activePathId == null ? 'bg-accent' : ''}
            >
              No path (trunk only)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {paths.map((path) => (
              <DropdownMenuItem
                key={path.id}
                onClick={() => onPathChange(path.id)}
                className={activePathId === path.id ? 'bg-accent' : ''}
              >
                {path.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
