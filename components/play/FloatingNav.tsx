'use client';

import { Part } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface FloatingNavProps {
  parts: Part[];
  currentPartId: string | null;
  onPartChange: (partId: string) => void;
  isCompact?: boolean;
}

export function FloatingNav({ parts, currentPartId, onPartChange, isCompact = false }: FloatingNavProps) {
  const currentPart = parts.find(p => p.id === currentPartId);

  return (
    <div 
      className="fixed top-4 left-4 z-40 transition-all duration-300 ease-in-out"
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
    </div>
  );
}

