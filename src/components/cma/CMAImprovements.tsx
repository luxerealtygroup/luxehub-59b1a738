import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Wrench } from 'lucide-react';

export interface ImprovementItem {
  id: string;
  description: string;
  amount: number;
  date?: string;
}

interface CMAImprovementsProps {
  items: ImprovementItem[];
  onChange: (items: ImprovementItem[]) => void;
  readOnly?: boolean;
  showDetailInReport?: boolean;
  onToggleShowDetail?: (show: boolean) => void;
}

const CMAImprovements = ({ items, onChange, readOnly = false }: CMAImprovementsProps) => {
  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const addItem = () => {
    onChange([...items, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  };

  const updateItem = (id: string, field: keyof ImprovementItem, value: string | number) => {
    onChange(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: string) => {
    onChange(items.filter(item => item.id !== id));
  };

  return (
    <Card className="border-gold/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-gold" /> Improvements & Upgrades
          </CardTitle>
          <div className="text-sm font-bold text-gold">
            Total: ${total.toLocaleString()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto] items-end">
            <div>
              {index === 0 && <Label className="text-xs">Description *</Label>}
              <Input
                value={item.description}
                onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                placeholder="Kitchen renovation"
                disabled={readOnly}
              />
            </div>
            <div>
              {index === 0 && <Label className="text-xs">Amount *</Label>}
              <Input
                type="number"
                value={item.amount || ''}
                onChange={(e) => updateItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                placeholder="25000"
                disabled={readOnly}
              />
            </div>
            <div>
              {index === 0 && <Label className="text-xs">Date</Label>}
              <Input
                type="date"
                value={item.date || ''}
                onChange={(e) => updateItem(item.id, 'date', e.target.value)}
                disabled={readOnly}
              />
            </div>
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No improvements added yet.</p>
        )}

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addItem} className="w-full border-dashed border-gold/30 text-muted-foreground hover:text-gold">
            <Plus className="h-4 w-4 mr-1" /> Add Improvement
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default CMAImprovements;
