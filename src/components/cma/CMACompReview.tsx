import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Plus, RotateCcw, Trash2, Eye, EyeOff, Loader2, CheckCircle, Info, FileSearch } from 'lucide-react';
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
  needs_review?: boolean;
  needs_review_reason?: string | null;
}

export interface ExtractionSummary {
  total_comps_found: number;
  sold_count: number;
  active_count: number;
  expired_count: number;
  low_confidence_count: number;
  needs_review_count: number;
  extraction_passes: number;
  sections_found?: string[];
  extraction_notes?: string;
  text_length?: number;
  chunks_processed?: number;
}

interface CMACompReviewProps {
  comps: ReviewComp[];
  onCompsChange: (comps: ReviewComp[]) => void;
  onReRunExtraction: () => void;
  isExtracting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  extractionSummary?: ExtractionSummary | null;
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
  needs_review: false,
});

const ConfidenceBadge = ({ confidence }: { confidence: number }) => {
  if (confidence >= 0.8) return <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-500">High</Badge>;
  if (confidence >= 0.5) return <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-500">Med</Badge>;
  return <Badge variant="outline" className="text-[9px] border-destructive text-destructive">Low</Badge>;
};

const CMACompReview = ({
  comps,
  onCompsChange,
  onReRunExtraction,
  isExtracting,
  onConfirm,
  onBack,
  isSubmitting,
  extractionSummary,
}: CMACompReviewProps) => {
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const includedComps = comps.filter(c => !c.excluded);
  const soldCount = includedComps.filter(c => c.comp_category === 'sold').length;
  const needsOverride = soldCount < 3;
  const needsReviewComps = comps.filter(c => c.needs_review);
  const partialComps = comps.filter(c => (c.confidence ?? 1) < 0.8 && (c.confidence ?? 1) >= 0.3);

  const updateComp = (id: string, field: keyof ReviewComp, value: any) => {
    onCompsChange(
      comps.map(c => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };
        if (!c._manual_edit) updated._manual_edit = true;
        // Clear needs_review if user edits the comp
        if (field !== 'excluded') updated.needs_review = false;
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
      {/* Import Summary Card */}
      {extractionSummary && extractionSummary.total_comps_found > 0 && (
        <Card className="border-gold/20 bg-gold/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-gold" /> PDF Import Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="text-center p-2 rounded-md bg-background border border-border">
                <p className="text-lg font-bold text-foreground">{extractionSummary.total_comps_found}</p>
                <p className="text-[10px] text-muted-foreground">Total Detected</p>
              </div>
              <div className="text-center p-2 rounded-md bg-background border border-emerald-500/20">
                <p className="text-lg font-bold text-emerald-500">
                  {extractionSummary.total_comps_found - (extractionSummary.needs_review_count || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">Fully Extracted</p>
              </div>
              <div className="text-center p-2 rounded-md bg-background border border-amber-500/20">
                <p className="text-lg font-bold text-amber-500">{extractionSummary.needs_review_count || 0}</p>
                <p className="text-[10px] text-muted-foreground">Needs Review</p>
              </div>
              <div className="text-center p-2 rounded-md bg-background border border-muted">
                <p className="text-lg font-bold text-muted-foreground">{extractionSummary.extraction_passes}</p>
                <p className="text-[10px] text-muted-foreground">Extraction Passes</p>
              </div>
            </div>
            
            {extractionSummary.sections_found && extractionSummary.sections_found.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                <span className="text-[10px] text-muted-foreground mr-1">Sections found:</span>
                {extractionSummary.sections_found.map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[9px]">{s}</Badge>
                ))}
              </div>
            )}
            
            {extractionSummary.extraction_notes && (
              <p className="text-[10px] text-muted-foreground mt-1">
                <Info className="h-3 w-3 inline mr-1" />
                {extractionSummary.extraction_notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Needs Review Alert */}
      {needsReviewComps.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-500">
                  {needsReviewComps.length} comparable{needsReviewComps.length > 1 ? 's' : ''} flagged for review
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These properties were partially extracted. Please verify or complete missing fields.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                Retry Parse
              </Button>
              <Button variant="outline" size="sm" onClick={addComp}>
                <Plus className="h-3 w-3 mr-1" /> Add Manually
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {comps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No comps extracted. Add comps manually or retry extraction.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-center py-2 px-1 text-[10px] text-muted-foreground font-medium w-[30px]">⚡</th>
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
                    className={`border-b border-border/50 ${comp.excluded ? 'opacity-40 bg-muted/30' : ''} ${comp.needs_review ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : comp._manual_edit ? 'bg-gold/5' : ''}`}
                  >
                    <td className="py-1 px-1 text-center">
                      {comp.needs_review ? (
                        <span title={comp.needs_review_reason || 'Needs review'} className="cursor-help">
                          <AlertTriangle className="h-3 w-3 text-amber-500 mx-auto" />
                        </span>
                      ) : (
                        <ConfidenceBadge confidence={comp.confidence ?? 1} />
                      )}
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        value={comp.address}
                        onChange={e => updateComp(comp.id, 'address', e.target.value)}
                        className={`h-7 text-xs ${comp.needs_review && !comp.address ? 'border-amber-500' : ''}`}
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
                        className={`h-7 text-xs text-right ${comp.needs_review && comp.list_price == null && comp.sold_price == null ? 'border-amber-500' : ''}`}
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <Input
                        type="number"
                        value={comp.sold_price ?? ''}
                        onChange={e => updateComp(comp.id, 'sold_price', e.target.value ? Number(e.target.value) : null)}
                        className={`h-7 text-xs text-right ${comp.needs_review && comp.list_price == null && comp.sold_price == null ? 'border-amber-500' : ''}`}
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
                        value={comp.notes ?? (comp.needs_review_reason || '')}
                        onChange={e => updateComp(comp.id, 'notes', e.target.value || null)}
                        className="h-7 text-xs"
                        placeholder={comp.needs_review_reason || 'Notes'}
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
        {needsReviewComps.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">
            Needs Review: {needsReviewComps.length}
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
