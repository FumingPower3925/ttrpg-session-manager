'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Sword } from 'lucide-react';

interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  type: 'pc' | 'npc';
}

interface InitiativeTrackerProps {
  playerCharacters: string[];
}

export function InitiativeTracker({ playerCharacters }: InitiativeTrackerProps) {
  const [entries, setEntries] = useState<InitiativeEntry[]>([]);
  const [newNPCName, setNewNPCName] = useState('');
  const [newNPCInit, setNewNPCInit] = useState('');
  const [showAddNPC, setShowAddNPC] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Initialize PCs when playerCharacters change
  useEffect(() => {
    // Remove old PCs that are no longer in the list
    setEntries(prev => {
      const npcs = prev.filter(e => e.type === 'npc');
      const newPCs = playerCharacters.map(pc => {
        const existing = prev.find(e => e.type === 'pc' && e.name === pc);
        return existing || {
          id: `pc-${pc}-${Date.now()}`,
          name: pc,
          initiative: 0,
          type: 'pc' as const
        };
      });
      return [...newPCs, ...npcs].sort((a, b) => b.initiative - a.initiative);
    });
  }, [playerCharacters]);

  const handleUpdateInitiative = (id: string, value: string) => {
    const initiative = parseInt(value) || 0;
    setEntries(prev => 
      prev
        .map(e => e.id === id ? { ...e, initiative } : e)
        .sort((a, b) => b.initiative - a.initiative)
    );
  };

  const handleAddNPC = () => {
    if (!newNPCName.trim()) return;
    
    const newEntry: InitiativeEntry = {
      id: `npc-${Date.now()}`,
      name: newNPCName.trim(),
      initiative: parseInt(newNPCInit) || 0,
      type: 'npc'
    };
    
    setEntries(prev => [...prev, newEntry].sort((a, b) => b.initiative - a.initiative));
    setNewNPCName('');
    setNewNPCInit('');
    setShowAddNPC(false);
  };

  const handleRemoveNPC = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleClearAll = () => {
    // Keep PCs, remove NPCs
    setEntries(prev => prev.filter(e => e.type === 'pc').map(e => ({ ...e, initiative: 0 })));
  };

  return (
    <>
      {/* Semi-circle indicator when collapsed */}
      {!isExpanded && (
        <div
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 cursor-pointer"
          onMouseEnter={() => setIsExpanded(true)}
        >
          <div className="bg-primary text-primary-foreground rounded-l-full pr-3 pl-4 py-3 shadow-lg flex items-center">
            <Sword className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* Full panel when expanded */}
      <div 
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 transition-transform duration-300 ease-in-out"
        style={{
          transform: isExpanded ? 'translateX(0)' : 'translateX(100%)'
        }}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <Card className="w-72 shadow-lg max-h-[70vh] flex flex-col">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center">
              <Sword className="h-4 w-4 mr-2" />
              Initiative
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearAll}
              className="h-6 text-xs"
            >
              Clear
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No combatants yet. Set initiative values to start tracking.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, index) => (
                <div 
                  key={entry.id} 
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                >
                  <Badge variant={entry.type === 'pc' ? 'default' : 'secondary'} className="text-xs w-8 h-8 flex items-center justify-center">
                    {index + 1}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {entry.type === 'pc' ? 'PC' : 'NPC'}
                    </Badge>
                  </div>
                  <Input
                    type="number"
                    value={entry.initiative || ''}
                    onChange={(e) => handleUpdateInitiative(entry.id, e.target.value)}
                    className="w-16 h-8 text-center"
                    placeholder="0"
                  />
                  {entry.type === 'npc' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemoveNPC(entry.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add NPC Section */}
          {showAddNPC ? (
            <div className="space-y-2 p-3 border rounded-lg">
              <Input
                placeholder="NPC/Monster name..."
                value={newNPCName}
                onChange={(e) => setNewNPCName(e.target.value)}
                className="h-8"
              />
              <Input
                type="number"
                placeholder="Initiative..."
                value={newNPCInit}
                onChange={(e) => setNewNPCInit(e.target.value)}
                className="h-8"
              />
              <div className="flex gap-2">
                <Button onClick={handleAddNPC} size="sm" className="flex-1">
                  Add
                </Button>
                <Button 
                  onClick={() => {
                    setShowAddNPC(false);
                    setNewNPCName('');
                    setNewNPCInit('');
                  }} 
                  variant="outline" 
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button 
              onClick={() => setShowAddNPC(true)} 
              variant="outline" 
              size="sm" 
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add NPC/Monster
            </Button>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
}

