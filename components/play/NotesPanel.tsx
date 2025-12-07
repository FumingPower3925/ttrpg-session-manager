'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { FileText } from 'lucide-react';

export function NotesPanel() {
  const [notes, setNotes] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const savedNotes = localStorage.getItem('campaignNotes');
    if (savedNotes) {
      setNotes(savedNotes);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('campaignNotes', notes);
  }, [notes]);

  const textareaRows = Math.max(3, Math.min(15, notes.split('\n').length));

  return (
    <>
      {/* Semi-circle indicator when collapsed - RIGHT side */}
      {!isExpanded && (
        <div
          className="fixed right-0 bottom-48 z-40 cursor-pointer"
          onMouseEnter={() => setIsExpanded(true)}
        >
          <div className="bg-primary text-primary-foreground rounded-l-full pr-3 pl-4 py-3 shadow-lg flex items-center">
            <FileText className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* Full panel when expanded - RIGHT side */}
      <div
        className="fixed right-0 bottom-48 z-40 transition-all duration-300 ease-in-out"
        style={{
          transform: `translateX(${isExpanded ? '0' : '100%'})`,
          maxHeight: '400px'
        }}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <Card className="w-80 shadow-lg h-full flex flex-col">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="flex items-center text-sm">
              <FileText className="h-4 w-4 mr-2" />
              Session Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto flex-1 py-3">
            <Textarea
              placeholder="Take notes during your session..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-y w-full min-h-[100px]"
              style={{ maxHeight: '300px' }}
            />
            <p className="text-xs text-muted-foreground">
              Notes persist across part changes.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
