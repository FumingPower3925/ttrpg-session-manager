'use client';

import { useState } from 'react';
import { Part, PathDef } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, GitBranch } from 'lucide-react';

interface PathManagerProps {
  parts: Part[];
  paths: PathDef[];
  onChange: (paths: PathDef[]) => void;
}

export function PathManager({ parts, paths, onChange }: PathManagerProps) {
  const [newPathName, setNewPathName] = useState('');

  const handleAddPath = () => {
    if (!newPathName.trim()) return;
    const newPath: PathDef = {
      id: `path-${Date.now()}`,
      name: newPathName.trim(),
      branchAfterPartId: parts[0]?.id ?? '',
    };
    onChange([...paths, newPath]);
    setNewPathName('');
  };

  const handleRenamePath = (id: string, name: string) => {
    onChange(paths.map(p => (p.id === id ? { ...p, name } : p)));
  };

  const handleBranchAfterChange = (id: string, branchAfterPartId: string) => {
    onChange(paths.map(p => (p.id === id ? { ...p, branchAfterPartId } : p)));
  };

  const handleDeletePath = (id: string) => {
    onChange(paths.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newPathName}
          onChange={(e) => setNewPathName(e.target.value)}
          placeholder="Path name (e.g., Sneak In, Fight Through)"
          onKeyPress={(e) => e.key === 'Enter' && handleAddPath()}
          disabled={parts.length === 0}
        />
        <Button onClick={handleAddPath} size="sm" disabled={parts.length === 0 || !newPathName.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Path
        </Button>
      </div>

      {parts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add at least one part before creating paths.</p>
      ) : paths.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No paths defined. Add a path to let the session fork into alternatives.
        </p>
      ) : (
        <div className="space-y-3">
          {paths.map((path) => (
            <Card key={path.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    value={path.name}
                    onChange={(e) => handleRenamePath(path.id, e.target.value)}
                    placeholder="Path name"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeletePath(path.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground whitespace-nowrap">
                    Branch after:
                  </label>
                  <Select
                    value={path.branchAfterPartId || undefined}
                    onValueChange={(value) => handleBranchAfterChange(path.id, value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a part" />
                    </SelectTrigger>
                    <SelectContent>
                      {parts.map((part) => (
                        <SelectItem key={part.id} value={part.id}>
                          {part.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
