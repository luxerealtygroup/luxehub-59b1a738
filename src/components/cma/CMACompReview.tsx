import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Plus, RotateCcw, Trash2, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface ReviewComp {
  id: string;
  address: string;
  comp_category: 'sold' | 'active' | 'expired' | 'other';
  list_price: number | null;
  sold_price: number | null;
  sale_date: string | null;
  days_on_market: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  notes: string | null;
  excluded: boolean;
  _manual_edit: boolean;
  confidence?: number;
  source_page?: number;
  area?: string;
  is_weak?: boolean;
  weak_reason?: string | null;
}

interface CMACompReviewProps {
  comps: ReviewComp[];
  onCompsChange: (comps: ReviewComp[]) => void;
  onReRunExtraction: () => void;
  isExtracting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const emptyComp = (): ReviewComp => ({
  id: crypto.randomUUID(),
  address: '',
  comp_category: 'sold',
  list_price: null,
  sold_price: null,
  sale_date: null,
  days_on_market: null,
  beds: null,
  baths: null,
  sqft: null,
  notes: null,
  excluded: false,
  _manual_edit: true,
  confidence: 1,
});

const CMACompReview = ({
  comps,
  onCompsChange,
  onReRunExtraction,
  isExtracting,
  onConfirm,
  onBack,
  isSubmitting,
}: CMACompReviewProps) => {
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const includedComps = comps.filter(c => !c.excluded);
  const soldCount = includedComps.filter(c => c.comp_category === 'sold').length;
  const needsOverride = soldCount < 3;

  const updateComp = (id: string, field: keyof ReviewComp, value: any) => {
    onCompsChange(
      comps.map(c => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        // Mark as manually edited if an AI-extracted comp is changed
        if (!c._manual_edit) updated._manual_edit = true;
        return updated;
      })
    );
  };

  const removeComp = (id: string) => {
    onCompsChange(comps.filter(c => c.id !== id));
  };

  const addComp = () => {
    onCompsChange([...comps, emptyComp()]);
  };

  const toggleExclude = (id: string) => {
    onCompsChange(
      comps.map(c => (c.id === id ? { ...c, excluded: !c.excluded } : c))
    );
  };

  const canConfirm = !needsOverride || (showOverride && overrideReason.trim().length > 0);

  return (
    <div className="space-y-4 max-w-6xl">
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-gold" /> Review Comparables
              <Badge variant="outline" className="text-[10px] ml-2">
                {includedComps.length} included
              </Badge>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onReRunExtraction}
                disabled={isExtracting}
              >
                {isExtracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                Re-run Extraction
              </Button>
              <Button variant="outline" size="sm" onClick={addComp}>
                <Plus className="h-3 w-3 mr-1" /> Add Comp
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {comps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No comps extracted. Add comps manually or re-run extraction.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-1 text-[10px] text-muted-foreground font-medium w-[180px]">Address</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[90px]">Category</th>
                  <th className="text-right py-2 px-1 text-[10px] text-muted-foreground font-medium w-[100px]">List $</th>
                  <th className="text-right py-2 px-1 text-[10px] text-muted-foreground font-medium w-[100px]">Sold $</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[90px]">Sale Date</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[50px]">DOM</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[40px]">Bd</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[40px]">Ba</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[60px]">SqFt</th>
                  <th className="text-left py-2 px-1 text-[10px] text-muted-foreground font-medium w-[120px]">Notes</th>
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[60px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {comps.map((comp) => (
                  <tr
                    key={comp.id}
                    className={`border-b border-border/50 ${comp.excluded ? 'opacity-40 bg-muted/30' : ''} ${comp._manual_edit ? 'bg-gold/5' : ''}`}
                  >
                    <td className="py-1 px-1">
                      <Input
                        value={comp.address}
                        onChange={e => updateComp(comp.id, 'address', e.target.value)}
                        className="h-7 text-xs"
                        placeholder="Address"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Select
                        value={comp.comp_category}
                        onValueChange={v => updateComp(comp.id, 'comp_category', v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sold">Sold</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.list_price ?? ''}
                        onChange={e => updateComp(comp.id, 'list_price', e.target.value ? Number(e.target.value) : null)}
                        className="h-7 text-xs text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.sold_price ?? ''}
                        onChange={e => updateComp(comp.id, 'sold_price', e.target.value ? Number(e.target.value) : null)}
                        className="h-7 text-xs text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="date"
                        value={comp.sale_date ?? ''}
                        onChange={e => updateComp(comp.id, 'sale_date', e.target.value || null)}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.days_on_market ?? ''}
                        onChange={e => updateComp(comp.id, 'days_on_market', e.target.value ? Number(e.target.value) : null)}
                        className="h-7 text-xs text-center"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.beds ?? ''}
                        onChange={e => updateComp(comp.id, 'beds', e.target.value ? Number(e.target.value) : null)}
                        className="h-7 text-xs text-center"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.baths ?? ''}
                        onChange={e => updateComp(comp.id, 'baths', e.target.value ? Number(e.target.value) : null)}
                        className="h-7 text-xs text-center"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.sqft ?? ''}
                        onChange={e => updateComp(comp.id, 'sqft', e.target.value ? Number(e.target.value) : null)}
                        className="h-7 text-xs text-center"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        value={comp.notes ?? ''}
                        onChange={e => updateComp(comp.id, 'notes', e.target.value || null)}
                        className="h-7 text-xs"
                        placeholder="Notes"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <div className="flex gap-0.5 justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleExclude(comp.id)}
                          title={comp.excluded ? 'Include in report' : 'Exclude from report'}
                        >
                          {comp.excluded ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-emerald-500" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeComp(comp.id)}
                          title="Remove comp"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Validation */}
      {needsOverride && (
        <Card className="border-amber-500/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm text-amber-500 font-medium">
                  Only {soldCount} sold comp{soldCount !== 1 ? 's' : ''} included (minimum 3 recommended).
                </p>
                {!showOverride ? (
                  <Button variant="outline" size="sm" onClick={() => setShowOverride(true)}>
                    Override with reason
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Explain why fewer than 3 sold comps is acceptable (e.g., 'Insufficient sold comps available in this micro-market')"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-500">
          Sold: {includedComps.filter(c => c.comp_category === 'sold').length}
        </Badge>
        <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-500">
          Active: {includedComps.filter(c => c.comp_category === 'active').length}
        </Badge>
        <Badge variant="outline" className="text-[10px] border-muted-foreground text-muted-foreground">
          Expired: {includedComps.filter(c => c.comp_category === 'expired').length}
        </Badge>
        {comps.filter(c => c.excluded).length > 0 && (
          <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
            Excluded: {comps.filter(c => c.excluded).length}
          </Badge>
        )}
        {comps.filter(c => c._manual_edit).length > 0 && (
          <Badge variant="outline" className="text-[10px] border-gold text-gold">
            Manual/Edited: {comps.filter(c => c._manual_edit).length}
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!canConfirm || isSubmitting}
          className="bg-gold hover:bg-gold/90 text-gold-foreground"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {isSubmitting ? 'Analyzing...' : 'Confirm & Generate Report'}
        </Button>
      </div>
    </div>
  );
};

export default CMACompReview;
