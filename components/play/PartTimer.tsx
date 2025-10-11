'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';

interface PartTimerProps {
  partName: string;
  planContent: string | null;
}

export function PartTimer({ partName, planContent }: PartTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expectedMinutes, setExpectedMinutes] = useState<{ min: number; max?: number } | null>(null);

  // Reset timer when part changes
  useEffect(() => {
    setElapsedSeconds(0);
  }, [partName]);

  // Parse expected duration from plan content
  useEffect(() => {
    if (!planContent) {
      setExpectedMinutes(null);
      return;
    }

    // Look for patterns like:
    // "## Duración: 15 minutos"
    // "## Duración: 60-75 minutos"
    const durationRegex = /##\s*Duración:\s*(\d+)(?:-(\d+))?\s*minutos?/i;
    const match = planContent.match(durationRegex);

    if (match) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : undefined;
      setExpectedMinutes({ min, max });
    } else {
      setExpectedMinutes(null);
    }
  }, [planContent]);

  // Timer tick
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeStatus = (): 'normal' | 'warning' | 'over' => {
    if (!expectedMinutes) return 'normal';
    
    const elapsedMinutes = elapsedSeconds / 60;
    const maxMinutes = expectedMinutes.max || expectedMinutes.min;

    if (elapsedMinutes > maxMinutes) {
      return 'over';
    } else if (elapsedMinutes > maxMinutes * 0.8) {
      return 'warning';
    }
    return 'normal';
  };

  const status = getTimeStatus();

  return (
    <Card className="fixed bottom-4 right-4 z-40 shadow-lg">
      <CardContent className="pt-4 pb-3 px-4 space-y-2">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${
            status === 'over' ? 'text-destructive' :
            status === 'warning' ? 'text-yellow-500' :
            'text-muted-foreground'
          }`} />
          <span className="text-xs font-medium text-muted-foreground">
            {partName}
          </span>
        </div>
        
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums ${
            status === 'over' ? 'text-destructive' :
            status === 'warning' ? 'text-yellow-500' :
            'text-foreground'
          }`}>
            {formatTime(elapsedSeconds)}
          </span>
          
          {expectedMinutes && (
            <span className="text-sm text-muted-foreground">
              / {expectedMinutes.max 
                ? `${expectedMinutes.min}-${expectedMinutes.max}` 
                : expectedMinutes.min} min
            </span>
          )}
        </div>

        {status === 'warning' && (
          <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
            Approaching time limit
          </Badge>
        )}
        
        {status === 'over' && (
          <Badge variant="destructive" className="text-xs">
            Over time
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

