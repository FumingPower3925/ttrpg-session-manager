'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Sword, ChevronRight, ChevronLeft, Pin, PinOff, RotateCcw, X, Shield, Heart } from 'lucide-react';
import { PlayerCharacterStats } from '@/types';

interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  type: 'pc' | 'npc';
  currentHP: number;
  maxHP: number;
  tempHP: number;
  defense: number;
  statusEffects: string[];
}

interface InitiativeTrackerProps {
  playerCharacters: string[];
  pcStats?: PlayerCharacterStats[];
}

interface CombatState {
  entries: InitiativeEntry[];
  currentTurnIndex: number;
  roundCount: number;
}

const STORAGE_KEY = 'initiativeTrackerState';

export function InitiativeTracker({ playerCharacters, pcStats }: InitiativeTrackerProps) {
  const [entries, setEntries] = useState<InitiativeEntry[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [roundCount, setRoundCount] = useState(1);
  const [newNPCName, setNewNPCName] = useState('');
  const [newNPCInit, setNewNPCInit] = useState('');
  const [showAddNPC, setShowAddNPC] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [newStatusInput, setNewStatusInput] = useState<Record<string, string>>({});
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed: CombatState = JSON.parse(savedState);
        setEntries(parsed.entries);
        setCurrentTurnIndex(parsed.currentTurnIndex);
        setRoundCount(parsed.roundCount);
      } catch {
        console.error('Failed to parse saved initiative state');
      }
    }
  }, []);

  useEffect(() => {
    const state: CombatState = { entries, currentTurnIndex, roundCount };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [entries, currentTurnIndex, roundCount]);

  useEffect(() => {
    setEntries(prev => {
      const npcs = prev.filter(e => e.type === 'npc');
      const newPCs = playerCharacters.map(pc => {
        const existing = prev.find(e => e.type === 'pc' && e.name === pc);
        if (existing) return existing;

        const stats = pcStats?.find(s => s.name === pc);
        const maxHP = stats?.maxHP ?? 0;
        const defense = stats?.defense ?? 0;

        return {
          id: `pc-${pc}-${Date.now()}`,
          name: pc,
          initiative: 0,
          type: 'pc' as const,
          currentHP: maxHP,
          maxHP,
          tempHP: 0,
          defense,
          statusEffects: []
        };
      });
      return [...newPCs, ...npcs].sort((a, b) => b.initiative - a.initiative);
    });
  }, [playerCharacters, pcStats]);

  const handleUpdateInitiative = (id: string, value: string) => {
    const initiative = parseInt(value) || 0;
    setEntries(prev =>
      prev
        .map(e => e.id === id ? { ...e, initiative } : e)
        .sort((a, b) => b.initiative - a.initiative)
    );
  };

  const handleUpdateHP = (id: string, field: 'currentHP' | 'maxHP' | 'tempHP', value: string) => {
    const numValue = parseInt(value) || 0;
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== id) return e;
        const updated = { ...e, [field]: numValue };
        if (field === 'maxHP' && e.currentHP === 0) {
          updated.currentHP = numValue;
        }
        return updated;
      })
    );
  };

  const handleUpdateDefense = (id: string, value: string) => {
    const defense = parseInt(value) || 0;
    setEntries(prev => prev.map(e => e.id === id ? { ...e, defense } : e));
  };

  const handleAddStatus = (id: string) => {
    const status = newStatusInput[id]?.trim();
    if (!status) return;
    setEntries(prev =>
      prev.map(e => e.id === id ? { ...e, statusEffects: [...e.statusEffects, status] } : e)
    );
    setNewStatusInput(prev => ({ ...prev, [id]: '' }));
  };

  const handleRemoveStatus = (id: string, statusIndex: number) => {
    setEntries(prev =>
      prev.map(e => e.id === id
        ? { ...e, statusEffects: e.statusEffects.filter((_, i) => i !== statusIndex) }
        : e
      )
    );
  };

  const handleAddNPC = () => {
    if (!newNPCName.trim()) return;

    const newEntry: InitiativeEntry = {
      id: `npc-${Date.now()}`,
      name: newNPCName.trim(),
      initiative: parseInt(newNPCInit) || 0,
      type: 'npc',
      currentHP: 0,
      maxHP: 0,
      tempHP: 0,
      defense: 0,
      statusEffects: []
    };

    setEntries(prev => [...prev, newEntry].sort((a, b) => b.initiative - a.initiative));
    setNewNPCName('');
    setNewNPCInit('');
    setShowAddNPC(false);
  };

  const handleRemoveNPC = (id: string) => {
    setEntries(prev => {
      const newEntries = prev.filter(e => e.id !== id);
      if (currentTurnIndex >= newEntries.length) {
        setCurrentTurnIndex(Math.max(0, newEntries.length - 1));
      }
      return newEntries;
    });
  };

  const handleNextTurn = useCallback(() => {
    if (entries.length === 0) return;
    const nextIndex = currentTurnIndex + 1;
    if (nextIndex >= entries.length) {
      setCurrentTurnIndex(0);
      setRoundCount(prev => prev + 1);
    } else {
      setCurrentTurnIndex(nextIndex);
    }
  }, [entries.length, currentTurnIndex]);

  const handlePrevTurn = useCallback(() => {
    if (entries.length === 0) return;
    if (currentTurnIndex === 0) {
      if (roundCount > 1) {
        setCurrentTurnIndex(entries.length - 1);
        setRoundCount(prev => prev - 1);
      }
    } else {
      setCurrentTurnIndex(prev => prev - 1);
    }
  }, [entries.length, currentTurnIndex, roundCount]);

  const handleClearAll = () => {
    setEntries(prev =>
      prev.filter(e => e.type === 'pc').map(e => ({
        ...e,
        initiative: 0,
        currentHP: 0,
        maxHP: 0,
        tempHP: 0,
        defense: 0,
        statusEffects: []
      }))
    );
    setCurrentTurnIndex(0);
    setRoundCount(1);
  };

  const handleResetCombat = () => {
    setCurrentTurnIndex(0);
    setRoundCount(1);
  };

  const getHPColor = (current: number, max: number) => {
    if (max === 0) return 'bg-muted';
    const percentage = (current / max) * 100;
    if (percentage > 50) return 'bg-green-500';
    if (percentage > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getHPPercentage = (current: number, max: number, temp: number) => {
    if (max === 0) return 0;
    return Math.min(100, ((current + temp) / max) * 100);
  };

  // Pinned compact view
  const renderPinnedView = () => (
    <div
      className="fixed left-0 top-1/2 -translate-y-1/2 z-50"
      onMouseEnter={() => !isPinned && setIsExpanded(true)}
    >
      <Card className="w-56 shadow-lg">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <Sword className="h-3 w-3" />
              R{roundCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsPinned(false)}
            >
              <PinOff className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3 space-y-1 max-h-[50vh] overflow-y-auto">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className={`flex items-center gap-2 p-1.5 rounded text-xs ${index === currentTurnIndex ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
                }`}
            >
              <span className="w-5 text-center font-bold">{entry.initiative}</span>
              <span className="flex-1 truncate">{entry.name}</span>
              {entry.statusEffects.length > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {entry.statusEffects.length}
                </Badge>
              )}
            </div>
          ))}
          <div className="flex gap-1 pt-2">
            <Button size="sm" variant="outline" className="flex-1 h-7" onClick={handlePrevTurn}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button size="sm" className="flex-1 h-7" onClick={handleNextTurn}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // If pinned, show compact view
  if (isPinned) {
    return renderPinnedView();
  }

  return (
    <>
      {/* Semi-circle indicator when collapsed */}
      {!isExpanded && (
        <div
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 cursor-pointer"
          onMouseEnter={() => setIsExpanded(true)}
        >
          <div className="bg-primary text-primary-foreground rounded-r-full pl-3 pr-4 py-3 shadow-lg flex items-center gap-2">
            <Sword className="h-5 w-5" />
            {entries.length > 0 && (
              <span className="text-xs font-medium">R{roundCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Full panel when expanded */}
      <div
        className="fixed left-0 top-1/2 -translate-y-1/2 z-40 transition-transform duration-300 ease-in-out"
        style={{
          transform: isExpanded ? 'translateX(0)' : 'translateX(-100%)'
        }}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <Card className="w-96 shadow-lg max-h-[85vh] flex flex-col">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Sword className="h-4 w-4" />
                Initiative
                <Badge variant="secondary" className="ml-1">Round {roundCount}</Badge>
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsPinned(true)}
                  title="Pin compact view"
                >
                  <Pin className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleResetCombat}
                  title="Reset to round 1"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-7 text-xs"
                >
                  Clear
                </Button>
              </div>
            </CardTitle>
          </CardHeader>

          {/* Turn Controls */}
          {entries.length > 0 && (
            <div className="px-4 pb-2 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrevTurn} className="flex-1">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <div className="flex-1 text-center">
                <p className="text-sm font-medium truncate">
                  {entries[currentTurnIndex]?.name || 'No combatants'}
                </p>
                <p className="text-xs text-muted-foreground">Current Turn</p>
              </div>
              <Button size="sm" onClick={handleNextTurn} className="flex-1">
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          <CardContent className="space-y-2 overflow-y-auto flex-1 pb-3">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No combatants yet. Add NPCs to start tracking.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg border transition-colors ${index === currentTurnIndex
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30'
                      }`}
                  >
                    {/* Main row - always visible */}
                    <div
                      className="flex items-center gap-2 p-2 cursor-pointer"
                      onClick={() => setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id)}
                    >
                      <Badge
                        variant={entry.type === 'pc' ? 'default' : 'secondary'}
                        className="text-xs w-7 h-7 flex items-center justify-center shrink-0"
                      >
                        {index + 1}
                      </Badge>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{entry.name}</p>
                          <Badge variant="outline" className="text-[10px] h-4">
                            {entry.type === 'pc' ? 'PC' : 'NPC'}
                          </Badge>
                        </div>

                        {/* HP Bar */}
                        {entry.maxHP > 0 && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${getHPColor(entry.currentHP, entry.maxHP)}`}
                                style={{ width: `${getHPPercentage(entry.currentHP, entry.maxHP, entry.tempHP)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {entry.currentHP + entry.tempHP}/{entry.maxHP}{entry.tempHP > 0 ? ` (+${entry.tempHP})` : ''}
                            </span>
                          </div>
                        )}

                        {/* Status Effects Pills */}
                        {entry.statusEffects.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entry.statusEffects.map((status, si) => (
                              <Badge
                                key={si}
                                variant="secondary"
                                className="text-[10px] h-4 px-1.5 cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveStatus(entry.id, si);
                                }}
                              >
                                {status}
                                <X className="h-2 w-2 ml-0.5" />
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <Input
                        type="number"
                        value={entry.initiative || ''}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleUpdateInitiative(entry.id, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-14 h-7 text-center text-sm"
                        placeholder="Init"
                      />

                      {entry.type === 'npc' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveNPC(entry.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    {/* Expanded details */}
                    {expandedEntryId === entry.id && (
                      <div className="px-2 pb-2 pt-0 space-y-2 border-t border-border/50">
                        {/* HP Row */}
                        <div className="flex items-center gap-2 pt-2">
                          <Heart className="h-3 w-3 text-red-500 shrink-0" />
                          <Input
                            type="number"
                            value={entry.currentHP || ''}
                            onChange={(e) => handleUpdateHP(entry.id, 'currentHP', e.target.value)}
                            className="h-7 w-20 text-xs"
                            placeholder="Current"
                          />
                          <span className="text-muted-foreground">+</span>
                          <Input
                            type="number"
                            value={entry.maxHP || ''}
                            onChange={(e) => handleUpdateHP(entry.id, 'maxHP', e.target.value)}
                            className="h-7 w-20 text-xs"
                            placeholder="Max"
                          />
                          <span className="text-xs text-muted-foreground">HP</span>
                        </div>

                        {/* Temp HP & Defense Row */}
                        <div className="flex items-center gap-2">
                          <Shield className="h-3 w-3 text-blue-500 shrink-0" />
                          <Input
                            type="number"
                            value={entry.tempHP || ''}
                            onChange={(e) => handleUpdateHP(entry.id, 'tempHP', e.target.value)}
                            className="h-7 w-20 text-xs"
                            placeholder="T. HP"
                          />
                          <span className="text-muted-foreground">+</span>
                          <Input
                            type="number"
                            value={entry.defense || ''}
                            onChange={(e) => handleUpdateDefense(entry.id, e.target.value)}
                            className="h-7 w-20 text-xs"
                            placeholder="DEF/AC"
                          />
                          <span className="text-xs text-muted-foreground">T. HP + AC</span>
                        </div>

                        {/* Status Effects Input */}
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            value={newStatusInput[entry.id] || ''}
                            onChange={(e) => setNewStatusInput(prev => ({ ...prev, [entry.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddStatus(entry.id);
                              }
                            }}
                            className="h-7 text-xs flex-1"
                            placeholder="Add status effect..."
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => handleAddStatus(entry.id)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
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
