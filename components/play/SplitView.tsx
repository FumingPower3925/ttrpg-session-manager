'use client';

import { useState } from 'react';
import { MarkdownViewer } from './MarkdownViewer';
import { GripVertical } from 'lucide-react';

interface SplitViewProps {
  leftContent: string;
  rightContent: string;
  leftTitle?: string;
  rightTitle?: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function SplitView({ leftContent, rightContent, leftTitle, rightTitle, onScroll }: SplitViewProps) {
  const [splitPosition, setSplitPosition] = useState(50); // percentage
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;

    // Limit between 20% and 80%
    const newPosition = Math.max(20, Math.min(80, percentage));
    setSplitPosition(newPosition);
  };

  return (
    <div
      className="flex h-full w-full relative"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Left Panel */}
      <div
        className="flex flex-col overflow-hidden border-r"
        style={{ width: `${splitPosition}%` }}
      >
        {leftTitle && (
          <div className="px-6 py-3 border-b bg-muted/50">
            <h3 className="font-semibold">{leftTitle}</h3>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <MarkdownViewer content={leftContent} />
          </div>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="w-1 bg-border hover:bg-primary cursor-col-resize flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute bg-background border rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Right Panel */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: `${100 - splitPosition}%` }}
      >
        {rightTitle && (
          <div className="px-6 py-3 border-b bg-muted/50">
            <h3 className="font-semibold">{rightTitle}</h3>
          </div>
        )}
        <div className="flex-1 overflow-y-auto" onScroll={onScroll}>
          <div className="p-6">
            <MarkdownViewer content={rightContent} />
          </div>
        </div>
      </div>
    </div>
  );
}

