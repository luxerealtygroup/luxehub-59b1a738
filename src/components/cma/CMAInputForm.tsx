import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Loader2, Home, DollarSign, BarChart3, FileUp, Users } from 'lucide-react';
import { FUBContactTypeahead } from '@/components/FUBContactTypeahead';
import { useHasFUB } from '@/hooks/useHasFUB';

interface CMAInputFormProps {
  onCreated: (reportId: string) => void;
  onCancel: () => void;
}

interface SelectedContact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

const CMAInputForm = ({ onCreated, onCancel }: CMAInputFormProps) => {
  const { user } = useAuth();
  const { hasFUB } = useHasFUB();
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // FUB Contact
  const [selectedContact, setSelectedContact] = useState<SelectedContact | null>(null);

  // Subject Property
  const [propertyAddress, setPropertyAddress] = useState('');
  const [cityArea, setCityArea] = useState('');
  const [propertyType, setPropertyType] = useState('detached');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [sqft, setSqft] = useState('');
  const [targetListPrice, setTargetListPrice] = useState('');
  const [intendedListDate, setIntendedListDate] = useState('');

  // Purchase History
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [improvements, setImprovements] = useState('');

  // CloudCMA PDF
  const [cmaPdf, setCmaPdf] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Market Stats
  const [statsMethod, setStatsMethod] = useState('manual');
  const [statsDateRange, setStatsDateRange] = useState('30');
  const [activeListings, setActiveListings] = useState('');
  const [soldListings, setSoldListings] = useState('');
  const [medianSalePrice, setMedianSalePrice] = useState('');
  const [avgDOM, setAvgDOM] = useState('');
  const [saleToListRatio, setSaleToListRatio] = useState('');
  const [monthsOfInventory, setMonthsOfInventory] = useState('');
  const [marketNotes, setMarketNotes] = useState('');
  const [statsPdf, setStatsPdf] = useState<File | null>(null);
  const [pastedStats, setPastedStats] = useState('');

  const hasMarketStats = () => {
    if (statsMethod === 'manual') return activeListings || soldListings || medianSalePrice || avgDOM || saleToListRatio;
    if (statsMethod === 'pdf') return !!statsPdf;
    if (statsMethod === 'paste') return !!pastedStats;
    return false;
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    if (!user) return null;
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/${folder}/${Date.now()}_${cleanName}`;
    const { error } = await supabase.storage.from('cma-documents').upload(path, file);
    if (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${file.name}`);
      return null;
    }
    return path;
  };

  const extractPdfText = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(bytes);
    const readable = text.match(/[A-Za-z0-9\s,.$/\-#@%&()]{10,}/g);
    return readable ? readable.join(' ').substring(0, 15000) : 'PDF text could not be extracted client-side';
  };

  const handleSubmit = async (andAnalyze: boolean) => {
    if (!user) return;
    if (!propertyAddress || !cityArea || !purchasePrice || !purchaseDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (andAnalyze && !hasMarketStats()) {
      toast.error('Please provide market stats before generating analysis');
      return;
    }

    setSaving(true);
    try {
      // Upload PDFs if present
      let cmaPdfPath: string | null = null;
      let cmaPdfName: string | null = null;
      if (cmaPdf) {
        setUploading(true);
        cmaPdfPath = await uploadFile(cmaPdf, 'cma-pdfs');
        cmaPdfName = cmaPdf.name;
        setUploading(false);
      }

      let statsPdfPath: string | null = null;
      if (statsMethod === 'pdf' && statsPdf) {
        setUploading(true);
        statsPdfPath = await uploadFile(statsPdf, 'stats-pdfs');
        setUploading(false);
      }

      // Insert record
      const insertData: Record<string, unknown> = {
        user_id: user.id,
        property_address: propertyAddress,
        city_area: cityArea,
        property_type: propertyType,
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseInt(bathrooms) : null,
        approx_sqft: sqft ? parseInt(sqft) : null,
        target_list_price: targetListPrice ? parseFloat(targetListPrice) : null,
        intended_list_date: intendedListDate || null,
        purchase_price: parseFloat(purchasePrice),
        purchase_date: purchaseDate,
        improvements_invested: improvements ? parseFloat(improvements) : 0,
        cma_pdf_path: cmaPdfPath,
        cma_pdf_name: cmaPdfName,
        fub_person_id: selectedContact?.id || null,
        fub_person_name: selectedContact?.name || null,
        stats_method: statsMethod,
        stats_date_range: statsDateRange ? `Last ${statsDateRange} Days` : null,
        active_listings: activeListings ? parseInt(activeListings) : null,
        sold_listings: soldListings ? parseInt(soldListings) : null,
        median_sale_price: medianSalePrice ? parseFloat(medianSalePrice) : null,
        avg_days_on_market: avgDOM ? parseFloat(avgDOM) : null,
        sale_to_list_ratio: saleToListRatio ? parseFloat(saleToListRatio) : null,
        months_of_inventory: monthsOfInventory ? parseFloat(monthsOfInventory) : null,
        market_notes: marketNotes || null,
        stats_pdf_path: statsPdfPath,
        stats_pasted_text: statsMethod === 'paste' ? pastedStats : null,
        analysis_status: andAnalyze ? 'processing' : 'draft',
      };

      const { data, error } = await supabase
        .from('cma_reports')
        .insert(insertData as any)
        .select('id')
        .single();

      if (error) throw error;

      if (andAnalyze && data) {
        setAnalyzing(true);
        // Extract PDF text if uploaded
        const pdfText = cmaPdf ? await extractPdfText(cmaPdf) : '';

        const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-analyze', {
          body: {
            pdfText,
            subjectProperty: {
              address: propertyAddress,
              city: cityArea,
              type: propertyType,
              beds: bedrooms || null,
              baths: bathrooms || null,
              sqft: sqft || null,
              targetPrice: targetListPrice || null,
            },
            purchaseHistory: {
              purchasePrice: parseFloat(purchasePrice),
              purchaseDate,
              improvements: improvements ? parseFloat(improvements) : 0,
            },
            marketStats: {
              method: statsMethod,
              dateRange: statsDateRange,
              activeListings: activeListings || null,
              soldListings: soldListings || null,
              medianSalePrice: medianSalePrice || null,
              avgDOM: avgDOM || null,
              saleToListRatio: saleToListRatio || null,
              monthsOfInventory: monthsOfInventory || null,
              notes: marketNotes || null,
              pastedText: pastedStats || null,
            },
          },
        });

        if (fnError) throw fnError;

        if (fnData?.success && fnData.analysis) {
          const a = fnData.analysis;
          // Calculate equity
          const pp = parseFloat(purchasePrice);
          const imp = improvements ? parseFloat(improvements) : 0;
          const eqLow = a.pricing_band_low ? a.pricing_band_low - pp - imp : null;
          const eqHigh = a.pricing_band_high ? a.pricing_band_high - pp - imp : null;

          await supabase.from('cma_reports').update({
            analysis_status: 'completed',
            extracted_comps: a.extracted_comps || [],
            cma_grade: a.cma_grade,
            pricing_band_low: a.pricing_band_low,
            pricing_band_recommended: a.pricing_band_recommended,
            pricing_band_high: a.pricing_band_high,
            pricing_confidence: a.pricing_confidence,
            risk_flags: a.risk_flags || [],
            weak_comp_alerts: a.weak_comp_alerts || [],
            adjustment_observations: a.adjustment_observations || [],
            talking_points: a.talking_points || [],
            seller_objections: a.seller_objections || [],
            strategy_recommendation: a.strategy_recommendation,
            market_narrative: a.market_narrative,
            equity_gain_low: eqLow,
            equity_gain_high: eqHigh,
            ai_raw_response: fnData.analysis,
          }).eq('id', data.id);

          toast.success('CMA analysis complete!');
        } else {
          await supabase.from('cma_reports').update({ analysis_status: 'error' }).eq('id', data.id);
          toast.error(fnData?.error || 'Analysis failed');
        }
        setAnalyzing(false);
      } else {
        toast.success('CMA report saved as draft');
      }

      onCreated(data!.id);
    } catch (err) {
      console.error('CMA submit error:', err);
      toast.error('Failed to save CMA report');
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  };

  const isProcessing = saving || uploading || analyzing;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* FUB Client Search */}
      {hasFUB && (
        <Card className="border-gold/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-gold" /> Link to Client (Follow Up Boss)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FUBContactTypeahead
              selectedContact={selectedContact}
              onSelect={setSelectedContact}
              onClear={() => setSelectedContact(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* Subject Property */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-gold" /> Subject Property
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Property Address *</Label>
            <Input value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div>
            <Label>City / Area *</Label>
            <Input value={cityArea} onChange={e => setCityArea(e.target.value)} placeholder="Toronto" />
          </div>
          <div>
            <Label>Property Type</Label>
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="detached">Detached</SelectItem>
                <SelectItem value="semi">Semi-Detached</SelectItem>
                <SelectItem value="town">Townhouse</SelectItem>
                <SelectItem value="condo">Condo</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bedrooms</Label>
            <Input type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="3" />
          </div>
          <div>
            <Label>Bathrooms</Label>
            <Input type="number" value={bathrooms} onChange={e => setBathrooms(e.target.value)} placeholder="2" />
          </div>
          <div>
            <Label>Approx Square Footage</Label>
            <Input type="number" value={sqft} onChange={e => setSqft(e.target.value)} placeholder="1800" />
          </div>
          <div>
            <Label>Target List Price</Label>
            <Input type="number" value={targetListPrice} onChange={e => setTargetListPrice(e.target.value)} placeholder="750000" />
          </div>
          <div>
            <Label>Intended List Date</Label>
            <Input type="date" value={intendedListDate} onChange={e => setIntendedListDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Purchase History */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gold" /> Client Purchase History
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Purchase Price *</Label>
            <Input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="500000" />
          </div>
          <div>
            <Label>Purchase Date *</Label>
            <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
          </div>
          <div>
            <Label>Improvements Invested</Label>
            <Input type="number" value={improvements} onChange={e => setImprovements(e.target.value)} placeholder="0" />
          </div>
        </CardContent>
      </Card>

      {/* CloudCMA Upload (Optional) */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="h-4 w-4 text-gold" /> CloudCMA PDF Upload
            <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gold/20 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".pdf"
              id="cma-pdf-upload"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.type !== 'application/pdf') {
                    toast.error('Only PDF files are accepted');
                    return;
                  }
                  setCmaPdf(file);
                }
              }}
            />
            <label htmlFor="cma-pdf-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              {cmaPdf ? (
                <p className="text-sm text-gold font-medium">{cmaPdf.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click to upload CloudCMA PDF</p>
              )}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Market Stats */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gold" /> Market Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={statsMethod} onValueChange={setStatsMethod}>
            <TabsList className="mb-4">
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
              <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
              <TabsTrigger value="paste">Paste Text</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-4">
              <div>
                <Label>Stats Date Range</Label>
                <Select value={statsDateRange} onValueChange={setStatsDateRange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="60">Last 60 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Active Listings</Label>
                  <Input type="number" value={activeListings} onChange={e => setActiveListings(e.target.value)} />
                </div>
                <div>
                  <Label>Sold Listings</Label>
                  <Input type="number" value={soldListings} onChange={e => setSoldListings(e.target.value)} />
                </div>
                <div>
                  <Label>Median Sale Price</Label>
                  <Input type="number" value={medianSalePrice} onChange={e => setMedianSalePrice(e.target.value)} />
                </div>
                <div>
                  <Label>Average Days on Market</Label>
                  <Input type="number" value={avgDOM} onChange={e => setAvgDOM(e.target.value)} />
                </div>
                <div>
                  <Label>Sale-to-List Ratio %</Label>
                  <Input type="number" step="0.1" value={saleToListRatio} onChange={e => setSaleToListRatio(e.target.value)} placeholder="98.5" />
                </div>
                <div>
                  <Label>Months of Inventory</Label>
                  <Input type="number" step="0.1" value={monthsOfInventory} onChange={e => setMonthsOfInventory(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Additional Market Notes</Label>
                <Textarea value={marketNotes} onChange={e => setMarketNotes(e.target.value)} placeholder="Any additional context about the market..." />
              </div>
            </TabsContent>

            <TabsContent value="pdf">
              <div className="border-2 border-dashed border-gold/20 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf"
                  id="stats-pdf-upload"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file && file.type === 'application/pdf') setStatsPdf(file);
                  }}
                />
                <label htmlFor="stats-pdf-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  {statsPdf ? (
                    <p className="text-sm text-gold font-medium">{statsPdf.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Upload market stats PDF</p>
                  )}
                </label>
              </div>
            </TabsContent>

            <TabsContent value="paste">
              <Textarea
                value={pastedStats}
                onChange={e => setPastedStats(e.target.value)}
                placeholder="Paste market stats text here..."
                rows={8}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>Cancel</Button>
        <Button
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={isProcessing}
        >
          {saving && !analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Draft
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={isProcessing}
          className="bg-gold hover:bg-gold/90 text-gold-foreground"
        >
          {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {analyzing ? 'Analyzing...' : 'Save & Analyze'}
        </Button>
      </div>
    </div>
  );
};

export default CMAInputForm;
