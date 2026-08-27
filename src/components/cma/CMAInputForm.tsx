import { useState, useEffect } from 'react';
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
import { Upload, Loader2, Home, DollarSign, BarChart3, FileUp, Users, Link2, PenLine, FileText, Check, ChevronRight, User, Calendar, ClipboardList, Sparkles } from 'lucide-react';
import { FUBContactTypeahead } from '@/components/FUBContactTypeahead';
import { useHasFUB } from '@/hooks/useHasFUB';
import CMACompReview, { type ReviewComp, type ExtractionSummary } from './CMACompReview';

type ExtractionOutcome = { comps: ReviewComp[]; summary: ExtractionSummary | null; error?: string | null };

import CMAPhotoUpload from './CMAPhotoUpload';
import CMAImprovements, { type ImprovementItem } from './CMAImprovements';

interface CMAInputFormProps {
  onCreated: (reportId: string) => void;
  onCancel: () => void;
  editReportId?: string | null;
}

interface SelectedContact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

type FormStep = 'input' | 'review';
type ImportMethod = 'pdf' | 'link' | 'manual';
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const WIZARD_STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: 'Client & Listing' },
  { n: 2, label: 'Subject Property' },
  { n: 3, label: 'Purchase History' },
  { n: 4, label: 'Comparables' },
  { n: 5, label: 'Agent Notes' },
  { n: 6, label: 'Review & Generate' },
];

const CMAInputForm = ({ onCreated, onCancel, editReportId }: CMAInputFormProps) => {
  const { user } = useAuth();
  const { hasFUB } = useHasFUB();
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState<FormStep>('input');
  const [extracting, setExtracting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editReportId);
  const isEditMode = !!editReportId;

  // FUB Contact
  const [selectedContact, setSelectedContact] = useState<SelectedContact | null>(null);

  // Wizard
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [maxStepReached, setMaxStepReached] = useState<WizardStep>(1);
  const [clientName, setClientName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [hasExtracted, setHasExtracted] = useState(false);

  // Subject Property
  const [propertyAddress, setPropertyAddress] = useState('');
  const [cityArea, setCityArea] = useState('');
  const [propertyType, setPropertyType] = useState('detached');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [sqft, setSqft] = useState('');
  const [targetListPrice, setTargetListPrice] = useState('');
  const [intendedListDate, setIntendedListDate] = useState('');

  // Extended Subject Property details (for valuation adjustments)
  const [aboveGradeSqFt, setAboveGradeSqFt] = useState('');
  const [finishedBasementSqFt, setFinishedBasementSqFt] = useState('');
  const [garage, setGarage] = useState('');
  const [buildYear, setBuildYear] = useState('');
  const [condition, setCondition] = useState('Good');
  const [keyFeaturesText, setKeyFeaturesText] = useState('');

  // Purchase History
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [improvements, setImprovements] = useState('');
  const [improvementsList, setImprovementsList] = useState<ImprovementItem[]>([]);

  // Agent Notes (free-form context passed to generate-cma)
  const [agentNotes, setAgentNotes] = useState('');

  // CloudCMA PDF
  const [cmaPdf, setCmaPdf] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Import method
  const [importMethod, setImportMethod] = useState<ImportMethod>('pdf');
  const [cmaSourceUrl, setCmaSourceUrl] = useState('');

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

  // Review comps
  const [reviewComps, setReviewComps] = useState<ReviewComp[]>([]);
  const [extractionSummary, setExtractionSummary] = useState<ExtractionSummary | null>(null);

  // Subject photos
  const [subjectPhotos, setSubjectPhotos] = useState<File[]>([]);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState(0);

  // Listing PDF extraction
  const [extractingListing, setExtractingListing] = useState(false);

  const handleListingPdfUpload = async (file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }
    setExtractingListing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',').pop() || '');
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('extract-listing-data', {
        body: { pdfBase64: base64 },
      });
      if (error) throw error;
      if (!data?.success || !data?.subjectProperty) {
        throw new Error(data?.error || 'Extraction failed');
      }
      const sp = data.subjectProperty;
      console.log('[extract-listing-data] raw response:', sp);

      if (sp.address) setPropertyAddress(sp.address);
      if (sp.city) {
        setCityArea(sp.area ? `${sp.city} — ${sp.area}` : sp.city);
      } else if (sp.area) {
        setCityArea(sp.area);
      }
      if (sp.propertyType) {
        const pt = String(sp.propertyType).toLowerCase();
        if (pt.includes('detached') && !pt.includes('semi')) setPropertyType('detached');
        else if (pt.includes('semi')) setPropertyType('semi');
        else if (pt.includes('town')) setPropertyType('town');
        else if (pt.includes('condo') || pt.includes('apartment')) setPropertyType('condo');
        else setPropertyType('other');
      }
      if (sp.bedrooms != null && sp.bedrooms !== '') setBedrooms(String(sp.bedrooms));
      if (sp.bathrooms != null && sp.bathrooms !== '') setBathrooms(String(sp.bathrooms));
      const sqftVal = sp.totalFinishedSqFt ?? sp.aboveGradeSqFt;
      if (sqftVal) setSqft(String(sqftVal));
      if (sp.aboveGradeSqFt) setAboveGradeSqFt(String(sp.aboveGradeSqFt));
      if (sp.finishedBasementSqFt) setFinishedBasementSqFt(String(sp.finishedBasementSqFt));
      if (sp.listPrice) setTargetListPrice(String(sp.listPrice));
      else if (sp.originalListPrice) setTargetListPrice(String(sp.originalListPrice));
      if (sp.garage) setGarage(String(sp.garage));
      if (sp.buildYear) setBuildYear(String(sp.buildYear));
      else if (sp.ageRange) setBuildYear(String(sp.ageRange));
      if (sp.condition) setCondition(String(sp.condition));
      if (Array.isArray(sp.keyFeatures) && sp.keyFeatures.length) {
        setKeyFeaturesText(sp.keyFeatures.join('\n'));
      }

      toast.success('Listing details extracted — please review and edit as needed');
    } catch (e: any) {
      console.error('Listing extraction failed:', e);
      toast.error(e?.message || 'Failed to extract listing details');
    } finally {
      setExtractingListing(false);
    }
  };

  // Load existing CMA data for editing
  const loadExistingReport = async () => {
    if (!editReportId) return;
    setLoadingEdit(true);
    try {
      const { data, error } = await supabase
        .from('cma_reports')
        .select('*')
        .eq('id', editReportId)
        .single();
      if (error) throw error;
      const r = data as any;
      setPropertyAddress(r.property_address || '');
      setCityArea(r.city_area || '');
      setPropertyType(r.property_type || 'detached');
      setBedrooms(r.bedrooms?.toString() || '');
      setBathrooms(r.bathrooms?.toString() || '');
      setSqft(r.approx_sqft?.toString() || '');
      setTargetListPrice(r.target_list_price?.toString() || '');
      setIntendedListDate(r.intended_list_date || '');
      setAboveGradeSqFt((r as any).above_grade_sqft?.toString() || '');
      setFinishedBasementSqFt((r as any).finished_basement_sqft?.toString() || '');
      setGarage((r as any).garage || '');
      setBuildYear((r as any).build_year?.toString() || '');
      setCondition((r as any).condition || 'Good');
      {
        const kf = (r as any).key_features;
        if (Array.isArray(kf)) setKeyFeaturesText(kf.join('\n'));
      }
      setPurchasePrice(r.purchase_price?.toString() || '');
      setPurchaseDate(r.purchase_date || '');
      setImprovements(r.improvements_invested?.toString() || '');
      setImprovementsList(Array.isArray(r.improvements_list) ? r.improvements_list : []);
      setAgentNotes((r as any).agent_notes || '');
      setStatsMethod(r.stats_method || 'manual');
      setStatsDateRange(r.stats_date_range?.replace(/[^0-9]/g, '') || '30');
      setActiveListings(r.active_listings?.toString() || '');
      setSoldListings(r.sold_listings?.toString() || '');
      setMedianSalePrice(r.median_sale_price?.toString() || '');
      setAvgDOM(r.avg_days_on_market?.toString() || '');
      setSaleToListRatio(r.sale_to_list_ratio?.toString() || '');
      setMonthsOfInventory(r.months_of_inventory?.toString() || '');
      setMarketNotes(r.market_notes || '');
      setPastedStats(r.stats_pasted_text || '');
      if (r.cma_source_url) {
        setCmaSourceUrl(r.cma_source_url);
        setImportMethod('link');
      } else if (r.cma_pdf_path) {
        setImportMethod('pdf');
      }
      if (r.fub_person_id) {
        setSelectedContact({ id: r.fub_person_id, name: r.fub_person_name || '' });
      }
      if (r.fub_person_name) setClientName(r.fub_person_name);
      // Allow free navigation across all steps when editing
      setMaxStepReached(6);
      // Load existing comps for review
      if (Array.isArray(r.extracted_comps) && r.extracted_comps.length > 0) {
        setReviewComps(r.extracted_comps.map((c: any) => ({
          id: c.id || crypto.randomUUID(),
          address: c.address || '',
          comp_category: normalizeCompCategory(c.comp_category || c.status),
          list_price: sanitizePrice(c.list_price),
          sold_price: sanitizePrice(c.sold_price),
          sale_date: c.sale_date ?? null,
          days_on_market: sanitizeInteger(c.days_on_market ?? c.dom),
          beds: sanitizeInteger(c.beds),
          baths: sanitizeInteger(c.baths),
          sqft: sanitizeInteger(c.sqft ?? c.square_feet ?? c.sq_ft),
          notes: c.notes || null,
          excluded: c.excluded || false,
          _manual_edit: c._manual_edit || false,
          confidence: c.confidence ?? 1,
          source_page: c.source_page ?? null,
          area: c.area || '',
          is_weak: c.is_weak || false,
          weak_reason: c.weak_reason || null,
        })));
      }
    } catch (err) {
      console.error('Failed to load CMA for editing:', err);
      toast.error('Failed to load CMA data');
    } finally {
      setLoadingEdit(false);
    }
  };

  useEffect(() => {
    if (editReportId) loadExistingReport();
  }, [editReportId]);

  // Load current user's name as default Agent Name
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.full_name) setAgentName(prev => prev || data.full_name);
    })();
  }, [user]);

  // Keep client name in sync with FUB selection when present
  useEffect(() => {
    if (selectedContact?.name) setClientName(selectedContact.name);
  }, [selectedContact]);

  const goToStep = (n: WizardStep) => {
    setWizardStep(n);
    setMaxStepReached(prev => (n > prev ? n : prev));
  };
  const nextStep = () => {
    if (wizardStep < 6) goToStep(((wizardStep + 1) as WizardStep));
  };
  const prevStep = () => {
    if (wizardStep > 1) setWizardStep(((wizardStep - 1) as WizardStep));
  };

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

  const uploadPhotos = async (): Promise<string[]> => {
    if (!user || subjectPhotos.length === 0) return [];
    const paths: string[] = [];
    for (const photo of subjectPhotos) {
      const path = await uploadFile(photo, 'subject-photos');
      if (path) paths.push(path);
    }
    return paths;
  };

  const extractPdfText = async (file: File): Promise<string> => {
    try {
      // Use pdf.js for proper PDF text extraction
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pages: string[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
        if (pageText.trim()) {
          pages.push(`--- PAGE ${i} ---\n${pageText}`);
        }
      }
      
      const fullText = pages.join('\n\n');
      console.log(`PDF.js extracted ${fullText.length} chars from ${pdf.numPages} pages`);
      
      if (fullText.length < 50) {
        // Fallback to raw byte extraction if pdf.js gets nothing (scanned PDF)
        return fallbackExtractPdfText(file);
      }
      
      // Limit to 120k chars for large PDFs
      return fullText.substring(0, 120000);
    } catch (err) {
      console.error('PDF.js extraction failed, using fallback:', err);
      return fallbackExtractPdfText(file);
    }
  };

  const fallbackExtractPdfText = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(bytes);
    const readable = text.match(/[A-Za-z0-9\s,.$/\-#@%&()+:;'"|*=~^`{}\[\]\\!?<>]{4,}/g);
    if (!readable) return 'PDF text could not be extracted client-side';
    return readable.join('\n').substring(0, 120000);
  };

  const getImprovementsTotal = () => {
    const listTotal = improvementsList.reduce((sum, item) => sum + (item.amount || 0), 0);
    return listTotal > 0 ? listTotal : (improvements ? parseFloat(improvements) : 0);
  };

  // Safety net for AI-extracted prices. Sometimes the extractor returns values
  // in thousands or otherwise truncated (e.g. "$849,900" → 84). If a residential
  // list/sold price comes back < 20,000 we assume it lost its trailing digits
  // and scale up by 10,000. Values already in a sane range pass through.
  const sanitizePrice = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    let n: number;
    if (typeof raw === 'string') {
      n = Number(raw.replace(/[^0-9.]/g, ''));
    } else {
      n = Number(raw);
    }
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1000) n = n * 10000;      // e.g. 84 → 840,000
    else if (n < 20000) n = n * 1000; // e.g. 849 → 849,000
    return Math.round(n);
  };

  const sanitizeInteger = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const n = typeof raw === 'string' ? Number(raw.replace(/[^0-9.]/g, '')) : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  const normalizeCompCategory = (raw: unknown): ReviewComp['comp_category'] => {
    const status = String(raw || '').toLowerCase().trim();
    if (status.includes('pending')) return 'pending';
    if (status.includes('closed') || status.includes('sold')) return 'sold';
    if (status.includes('active')) return 'active';
    if (status.includes('expired') || status.includes('withdrawn') || status.includes('terminated')) return 'expired';
    return 'other';
  };

  const buildRequestBody = (pdfText: string, manualComps: ReviewComp[]) => ({
    pdfText,
    subjectProperty: {
      address: propertyAddress,
      city: cityArea,
      type: propertyType,
      beds: bedrooms || null,
      baths: bathrooms || null,
      sqft: sqft || null,
      targetPrice: targetListPrice || null,
      aboveGradeSqFt: aboveGradeSqFt ? parseInt(aboveGradeSqFt) : null,
      finishedBasementSqFt: finishedBasementSqFt ? parseInt(finishedBasementSqFt) : null,
      garage: garage || null,
      buildYear: buildYear || null,
      condition: condition || null,
      keyFeatures: keyFeaturesText
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean),
    },
    purchaseHistory: {
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      purchaseDate: purchaseDate || null,
      improvements: getImprovementsTotal(),
    },
    agentNotes: agentNotes.trim() ? agentNotes.trim() : null,
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
    existingManualComps: manualComps.filter(c => c._manual_edit),
  });

  // Record every import attempt (success AND failure) so support can diagnose
  // reports like "extraction isn't working" after the fact.
  const logImportAttempt = (payload: Record<string, unknown>) => {
    if (!user) return;
    supabase.from('cma_import_logs').insert({ user_id: user.id, ...payload } as any).then(() => {});
  };

  const runExtraction = async (): Promise<ExtractionOutcome> => {
    if (!cmaPdf) return { comps: [], summary: null, error: 'No PDF uploaded' };
    const startTime = Date.now();
    let pdfText = '';
    try {
      pdfText = await extractPdfText(cmaPdf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF text extraction failed';
      logImportAttempt({
        file_name: cmaPdf.name,
        file_size_bytes: cmaPdf.size,
        total_blocks_detected: 0,
        comps_imported: 0,
        comps_partial: 0,
        comps_skipped: 0,
        skip_reasons: [`pdf_text_extraction_failed: ${msg}`],
        extraction_passes: 0,
        extraction_duration_ms: Date.now() - startTime,
        raw_text_length: 0,
      });
      return { comps: [], summary: null, error: 'The text in this PDF could not be read. It may be a scanned/image-only file.' };
    }

    const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-analyze', {
      body: buildRequestBody(pdfText, reviewComps),
    });
    if (fnError || !fnData?.success || !fnData.analysis?.extracted_comps) {
      const msg = fnError?.message || fnData?.error || 'Extraction failed';
      logImportAttempt({
        file_name: cmaPdf.name,
        file_size_bytes: cmaPdf.size,
        total_blocks_detected: 0,
        comps_imported: 0,
        comps_partial: 0,
        comps_skipped: 0,
        skip_reasons: [`analyze_failed: ${msg}`],
        extraction_passes: 0,
        extraction_duration_ms: Date.now() - startTime,
        raw_text_length: pdfText.length,
      });
      return { comps: [], summary: null, error: msg };
    }

    const aiComps: any[] = fnData.analysis.extracted_comps || [];
    const summary: ExtractionSummary = fnData.analysis.extraction_summary || {
      total_comps_found: aiComps.length,
      sold_count: aiComps.filter((c: any) => c.comp_category === 'sold').length,
      pending_count: aiComps.filter((c: any) => c.comp_category === 'pending').length,
      active_count: aiComps.filter((c: any) => c.comp_category === 'active').length,
      expired_count: aiComps.filter((c: any) => c.comp_category === 'expired').length,
      low_confidence_count: aiComps.filter((c: any) => (c.confidence ?? 1) < 0.5).length,
      needs_review_count: aiComps.filter((c: any) => c.needs_review).length,
      extraction_passes: 1,
    };

    // Log import to cma_import_logs
    logImportAttempt({
      file_name: cmaPdf.name,
      file_size_bytes: cmaPdf.size,
      total_blocks_detected: summary.total_comps_found,
      comps_imported: aiComps.filter((c: any) => !c.needs_review).length,
      comps_partial: aiComps.filter((c: any) => c.needs_review).length,
      comps_skipped: 0,
      skip_reasons: aiComps.length === 0 ? ['zero_comps_returned'] : [],
      extraction_passes: summary.extraction_passes,
      extraction_duration_ms: Date.now() - startTime,
      raw_text_length: pdfText.length,
    });


    const mappedComps = aiComps.map((c: any) => ({
      id: crypto.randomUUID(),
      address: c.address || '',
      comp_category: normalizeCompCategory(c.comp_category || c.status),
      list_price: sanitizePrice(c.list_price),
      sold_price: sanitizePrice(c.sold_price),
      sale_date: c.sale_date ?? null,
      days_on_market: sanitizeInteger(c.days_on_market ?? c.dom),
      beds: sanitizeInteger(c.beds),
      baths: sanitizeInteger(c.baths),
      sqft: sanitizeInteger(c.sqft ?? c.square_feet ?? c.sq_ft),
      notes: c.notes ?? null,
      excluded: false,
      _manual_edit: !!c._manual_edit,
      confidence: c.confidence ?? 1,
      source_page: c.source_page ?? null,
      area: c.area || '',
      is_weak: c.is_weak || false,
      weak_reason: c.weak_reason || null,
      needs_review: c.needs_review || false,
      needs_review_reason: c.needs_review_reason || null,
    }));

    // [DEBUG-LOG-C] Final mappedComps right before saving to state
    console.log('[DEBUG-LOG-C] aiComps from edge function (pre-map):', JSON.stringify(aiComps, null, 2));
    console.log('[DEBUG-LOG-C] Final mappedComps before setState:', JSON.stringify(mappedComps, null, 2));

    return { comps: mappedComps, summary };
  };

  // Extract from CloudCMA link (HTML report page or PDF report link)
  const runLinkExtraction = async (): Promise<ExtractionOutcome> => {
    if (!cmaSourceUrl) return { comps: [], summary: null, error: 'No link provided' };

    const startTime = Date.now();
    const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-scrape-link', {
      body: { url: cmaSourceUrl, subjectAddress: propertyAddress },
    });

    if (fnError || !fnData?.success) {
      const msg = fnData?.error || fnError?.message || 'Link extraction failed. You can still add comparables manually.';
      logImportAttempt({
        source_type: 'link',
        cma_source_url: cmaSourceUrl,
        total_blocks_detected: 0,
        comps_imported: 0,
        comps_partial: 0,
        comps_skipped: 0,
        skip_reasons: [`link_extraction_failed: ${msg}`],
        extraction_passes: 0,
        extraction_duration_ms: Date.now() - startTime,
      });
      return { comps: [], summary: null, error: msg };
    }

    const aiComps: any[] = fnData.extracted_comps || [];
    const summary: ExtractionSummary = fnData.extraction_summary || {
      total_comps_found: aiComps.length,
      sold_count: aiComps.filter((c: any) => c.comp_category === 'sold').length,
      pending_count: aiComps.filter((c: any) => c.comp_category === 'pending').length,
      active_count: aiComps.filter((c: any) => c.comp_category === 'active').length,
      expired_count: aiComps.filter((c: any) => c.comp_category === 'expired').length,
      low_confidence_count: aiComps.filter((c: any) => (c.confidence ?? 1) < 0.5).length,
      needs_review_count: aiComps.filter((c: any) => c.needs_review).length,
      extraction_passes: 1,
    };

    // Log import
    logImportAttempt({
      source_type: 'link',
      cma_source_url: cmaSourceUrl,
      total_blocks_detected: summary.total_comps_found,
      comps_imported: aiComps.filter((c: any) => !c.needs_review).length,
      comps_partial: aiComps.filter((c: any) => c.needs_review).length,
      comps_skipped: 0,
      skip_reasons: aiComps.length === 0 ? ['zero_comps_returned'] : [],
      extraction_passes: 1,
      extraction_duration_ms: Date.now() - startTime,
    });


    const mappedComps = aiComps.map((c: any) => ({
      id: crypto.randomUUID(),
      address: c.address || '',
      comp_category: normalizeCompCategory(c.comp_category || c.status),
      list_price: sanitizePrice(c.list_price),
      sold_price: sanitizePrice(c.sold_price),
      sale_date: c.sale_date ?? null,
      days_on_market: sanitizeInteger(c.days_on_market ?? c.dom),
      beds: sanitizeInteger(c.beds),
      baths: sanitizeInteger(c.baths),
      sqft: sanitizeInteger(c.sqft ?? c.square_feet ?? c.sq_ft),
      notes: c.notes ?? null,
      excluded: false,
      _manual_edit: false,
      confidence: c.confidence ?? 1,
      source_page: null,
      area: c.area || '',
      is_weak: c.is_weak || false,
      weak_reason: c.weak_reason || null,
      needs_review: c.needs_review || false,
      needs_review_reason: c.needs_review_reason || null,
    }));

    return { comps: mappedComps, summary };
  };

  // Shared handling for every extraction entry point: never report a failed or
  // empty extraction as a success, and never wipe comps the agent already has.
  const applyExtractionOutcome = (
    outcome: ExtractionOutcome,
    label: 'PDF' | 'link'
  ) => {
    const { comps: extracted, summary, error } = outcome;
    if (extracted.length === 0) {
      toast.error(
        error ||
          `No comparables could be read from this ${label}. Add comparables manually, or try a text-based CloudCMA ${label === 'PDF' ? 'PDF' : 'report link or PDF'}.`,
        { duration: 8000 }
      );
      return false;
    }
    // Preserve manual comps, replace previous auto-extracted ones.
    const manualComps = reviewComps.filter(c => c._manual_edit);
    const manualAddresses = new Set(manualComps.map(c => c.address.toLowerCase().trim()));
    const newAiComps = extracted.filter(
      c => !c._manual_edit && !manualAddresses.has(c.address.toLowerCase().trim())
    );
    setReviewComps([...manualComps, ...newAiComps]);
    setExtractionSummary(summary);
    const reviewCount = newAiComps.filter(c => c.needs_review).length;
    toast.success(
      `Extracted ${newAiComps.length} comps from ${label}${reviewCount > 0 ? ` (${reviewCount} need review)` : ''}` +
        (manualComps.length > 0 ? ` · ${manualComps.length} manual comps preserved` : '')
    );
    return true;
  };

  // Step 1: Move to review (extract if PDF/link present, else empty review)
  const handleProceedToReview = async () => {
    if (!propertyAddress || !cityArea) {
      toast.error('Please fill in all required fields');
      return;
    }
    // Extract from PDF
    if (importMethod === 'pdf' && cmaPdf) {
      setExtracting(true);
      try {
        applyExtractionOutcome(await runExtraction(), 'PDF');
      } catch (err) {
        console.error('Extraction error:', err);
        toast.error('Failed to extract comps from PDF. You can add comparables manually.');
      } finally {
        setExtracting(false);
      }
    }

    // Extract from CloudCMA link
    if (importMethod === 'link' && cmaSourceUrl) {
      // Validate URL
      try { new URL(cmaSourceUrl); } catch {
        toast.error('Please enter a valid URL');
        return;
      }
      setExtracting(true);
      try {
        applyExtractionOutcome(await runLinkExtraction(), 'link');
      } catch (err) {
        console.error('Link extraction error:', err);
        toast.error('Unable to extract from link. You can add comparables manually.');
      } finally {
        setExtracting(false);
      }
    }

    setStep('review');
  };

  // Re-run extraction preserving manual edits
  const handleReRunExtraction = async () => {
    if (!cmaPdf) {
      toast.error('No PDF uploaded to extract from');
      return;
    }
    setExtracting(true);
    try {
      applyExtractionOutcome(await runExtraction(), 'PDF');
    } catch (err) {
      console.error('Re-extraction error:', err);
      toast.error('Re-extraction failed');
    } finally {
      setExtracting(false);
    }
  };


  // Step 2: Confirm comps & generate report
  const handleConfirmAndAnalyze = async () => {
    if (!user) return;
    setSaving(true);
    setAnalyzing(true);

    try {
      // Upload PDFs
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

      // Build final comps (only non-excluded)
      const finalComps = reviewComps
        .filter(c => !c.excluded)
        .map(c => ({
          address: c.address,
          area: c.area || '',
          beds: c.beds,
          baths: c.baths,
          list_price: c.list_price,
          sold_price: c.sold_price,
          days_on_market: c.days_on_market,
          sale_date: c.sale_date,
          is_weak: c.is_weak || false,
          weak_reason: c.weak_reason || null,
          comp_category: c.comp_category,
          source_page: c.source_page ?? null,
          confidence: c.confidence ?? 1,
          _manual_edit: c._manual_edit,
          sqft: c.sqft,
          notes: c.notes,
        }));

      // Upload photos
      setUploading(true);
      const photoPaths = await uploadPhotos();
      setUploading(false);

      // Build common fields
      const reportData: Record<string, unknown> = {
        property_address: propertyAddress,
        city_area: cityArea,
        property_type: propertyType,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        approx_sqft: sqft ? parseInt(sqft) : null,
        target_list_price: targetListPrice ? parseFloat(targetListPrice) : null,
        intended_list_date: intendedListDate || null,
        above_grade_sqft: aboveGradeSqFt ? parseInt(aboveGradeSqFt) : null,
        finished_basement_sqft: finishedBasementSqFt ? parseInt(finishedBasementSqFt) : null,
        garage: garage || null,
        build_year: /^\d{4}$/.test(buildYear) ? parseInt(buildYear) : null,
        condition: condition || null,
        key_features: keyFeaturesText.split('\n').map(s => s.trim()).filter(Boolean),
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_date: purchaseDate || null,
        improvements_invested: getImprovementsTotal(),
        improvements_list: improvementsList,
        agent_notes: agentNotes.trim() || null,
        ...(cmaPdfName ? { cma_pdf_name: cmaPdfName } : {}),
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
        ...(statsPdfPath ? { stats_pdf_path: statsPdfPath } : {}),
        stats_pasted_text: statsMethod === 'paste' ? pastedStats : null,
        analysis_status: 'processing',
        extracted_comps: finalComps,
        last_edited_by: user.id,
        cma_source_url: cmaSourceUrl || null,
      };

      // Handle photos: only update if new photos were uploaded
      if (photoPaths.length > 0) {
        reportData.subject_photos = photoPaths;
        reportData.cover_photo_index = coverPhotoIndex < photoPaths.length ? coverPhotoIndex : 0;
      }

      let reportId: string;

      if (isEditMode && editReportId) {
        // Update existing record, increment version
        const { error } = await supabase
          .from('cma_reports')
          .update(reportData as any)
          .eq('id', editReportId);
        if (error) throw error;
        // Increment version number
        await supabase.rpc('increment_cma_version', { report_id: editReportId });
        reportId = editReportId;
      } else {
        // Insert new record
        reportData.user_id = user.id;
        const { data, error } = await supabase
          .from('cma_reports')
          .insert(reportData as any)
          .select('id')
          .single();
        if (error) throw error;
        reportId = data!.id;
      }

      // Run analysis with reviewed comps included in the request
      const pdfText = cmaPdf ? await extractPdfText(cmaPdf) : '';
      const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-analyze', {
        body: {
          ...buildRequestBody(pdfText, finalComps as any),
          reviewedComps: finalComps,
        },
      });

      if (fnError) throw fnError;

      if (fnData?.success && fnData.analysis) {
        const a = fnData.analysis;
        const pp = purchasePrice ? parseFloat(purchasePrice) : 0;
        const imp = getImprovementsTotal();
        const eqLow = a.pricing_band_low && pp ? a.pricing_band_low - pp - imp : null;
        const eqHigh = a.pricing_band_high && pp ? a.pricing_band_high - pp - imp : null;

        await supabase.from('cma_reports').update({
          analysis_status: 'completed',
          extracted_comps: finalComps,
          cma_grade: a.cma_grade,
          pricing_band_low: a.pricing_band_low,
          pricing_band_recommended: a.pricing_band_recommended,
          pricing_band_high: a.pricing_band_high,
          pricing_confidence: a.pricing_confidence,
          risk_flags: a.risk_flags || [],
          weak_comp_alerts: a.weak_comp_alerts || [],
          adjustment_observations: a.adjustment_observations || [],
          feature_adjustments: a.feature_adjustments || [],
          price_per_sqft_cross_check: a.price_per_sqft_cross_check ?? null,
          valuation_scenarios: a.valuation_scenarios ?? null,
          talking_points: a.talking_points || [],
          seller_objections: a.seller_objections || [],
          strategy_recommendation: a.strategy_recommendation,
          market_narrative: a.market_narrative,
          equity_gain_low: eqLow,
          equity_gain_high: eqHigh,
          ai_raw_response: fnData.analysis,
        }).eq('id', reportId);

        // Editorial HTML CMA is generated on-demand from the Audit view via the
        // "Generate CMA" button, which calls the generate-cma edge function.

        toast.success('CMA analysis complete!');
      } else {
        await supabase.from('cma_reports').update({ analysis_status: 'error' }).eq('id', reportId);
        toast.error(fnData?.error || 'Analysis failed');
      }

      onCreated(reportId);
    } catch (err) {
      console.error('CMA submit error:', err);
      toast.error('Failed to save CMA report');
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  };

  // Save as draft (skip review)
  const handleSaveDraft = async () => {
    if (!user) return;
    if (!propertyAddress || !cityArea) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
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

      // Upload photos
      setUploading(true);
      const photoPaths = await uploadPhotos();
      setUploading(false);

      const draftData: Record<string, unknown> = {
        property_address: propertyAddress,
        city_area: cityArea,
        property_type: propertyType,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        approx_sqft: sqft ? parseInt(sqft) : null,
        target_list_price: targetListPrice ? parseFloat(targetListPrice) : null,
        intended_list_date: intendedListDate || null,
        above_grade_sqft: aboveGradeSqFt ? parseInt(aboveGradeSqFt) : null,
        finished_basement_sqft: finishedBasementSqFt ? parseInt(finishedBasementSqFt) : null,
        garage: garage || null,
        build_year: /^\d{4}$/.test(buildYear) ? parseInt(buildYear) : null,
        condition: condition || null,
        key_features: keyFeaturesText.split('\n').map(s => s.trim()).filter(Boolean),
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_date: purchaseDate || null,
        improvements_invested: getImprovementsTotal(),
        improvements_list: improvementsList,
        agent_notes: agentNotes.trim() || null,
        ...(cmaPdfPath ? { cma_pdf_path: cmaPdfPath } : {}),
        ...(cmaPdfName ? { cma_pdf_name: cmaPdfName } : {}),
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
        ...(statsPdfPath ? { stats_pdf_path: statsPdfPath } : {}),
        stats_pasted_text: statsMethod === 'paste' ? pastedStats : null,
        analysis_status: 'draft',
        last_edited_by: user.id,
        cma_source_url: cmaSourceUrl || null,
      };

      if (photoPaths.length > 0) {
        draftData.subject_photos = photoPaths;
        draftData.cover_photo_index = coverPhotoIndex < photoPaths.length ? coverPhotoIndex : 0;
      }

      let reportId: string;

      if (isEditMode && editReportId) {
        const { error } = await supabase
          .from('cma_reports')
          .update(draftData as any)
          .eq('id', editReportId);
        if (error) throw error;
        reportId = editReportId;
      } else {
        draftData.user_id = user.id;
        const { data, error } = await supabase
          .from('cma_reports')
          .insert(draftData as any)
          .select('id')
          .single();
        if (error) throw error;
        reportId = data!.id;
      }

      toast.success(isEditMode ? 'CMA report updated' : 'CMA report saved as draft');
      onCreated(reportId);
    } catch (err) {
      console.error('CMA draft error:', err);
      toast.error('Failed to save CMA report');
    } finally {
      setSaving(false);
    }
  };

  const isProcessing = saving || uploading || analyzing || extracting || loadingEdit;

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
        <span className="ml-2 text-muted-foreground">Loading CMA data...</span>
      </div>
    );
  }

  // Trigger comp extraction from PDF / link (called from Step 4)
  const handleExtractComps = async () => {
    if (importMethod === 'pdf' && !cmaPdf) {
      toast.error('Please upload a PDF first');
      return;
    }
    if (importMethod === 'link' && !cmaSourceUrl) {
      toast.error('Please paste a CloudCMA link first');
      return;
    }
    setExtracting(true);
    try {
      if (importMethod === 'pdf') {
        const { comps: extracted, summary } = await runExtraction();
        setReviewComps(extracted);
        setExtractionSummary(summary);
        toast.success(`Extracted ${extracted.length} comps from PDF`);
      } else if (importMethod === 'link') {
        try { new URL(cmaSourceUrl); } catch {
          toast.error('Please enter a valid URL');
          return;
        }
        const { comps: extracted, summary } = await runLinkExtraction();
        setReviewComps(extracted);
        setExtractionSummary(summary);
        toast.success(`Extracted ${extracted.length} comps from link`);
      }
      setHasExtracted(true);
    } catch (err) {
      console.error('Extraction error:', err);
      toast.error('Extraction failed. You can add comparables manually.');
    } finally {
      setExtracting(false);
    }
  };

  // Non-blocking, quality warnings per step. Agents can always advance.
  const stepWarnings = (n: WizardStep): string[] => {
    const w: string[] = [];
    if (n === 1) {
      if (!clientName.trim()) w.push('No client name entered');
      if (!agentName.trim()) w.push('No agent name entered');
    }
    if (n === 2) {
      if (!propertyAddress.trim()) w.push('Property address is empty');
      if (!cityArea.trim()) w.push('City / Area is empty');
      if (!sqft.trim() && !aboveGradeSqFt.trim()) {
        w.push('No square footage entered — valuation adjustments may be less accurate');
      }
      if (!targetListPrice.trim()) w.push('No target list price entered');
      if (!keyFeaturesText.trim()) {
        w.push('No Key Features added — the CMA\u2019s valuation adjustments may be less accurate without this');
      }
    }
    if (n === 4) {
      const included = reviewComps.filter(c => !c.excluded);
      if (included.length === 0) w.push('No comparables added — the CMA needs comps to produce a defensible price band');
      else if (included.filter(c => c.comp_category === 'sold').length < 3) {
        w.push('Fewer than 3 sold comparables — pricing confidence will be limited');
      }
    }
    if (n === 5) {
      if (!agentNotes.trim()) w.push('No agent notes added — optional, but adds context to the Opinion of Value');
    }
    return w;
  };

  const allWarnings = (): { step: WizardStep; label: string; warnings: string[] }[] =>
    WIZARD_STEPS
      .filter(s => s.n !== 6)
      .map(s => ({ step: s.n, label: s.label, warnings: stepWarnings(s.n) }))
      .filter(x => x.warnings.length > 0);

  const handleNext = () => {
    nextStep();
  };

  const StepWarnings = ({ step }: { step: WizardStep }) => {
    const w = stepWarnings(step);
    if (w.length === 0) return null;
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
        {w.map((msg, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span aria-hidden>⚠</span>
            <span>{msg}</span>
          </div>
        ))}
      </div>
    );
  };

  const fmtCurrency = (v: string | number) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return '—';
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const Stepper = (
    <div className="mb-8">
      {/* Mobile compact */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Step {wizardStep} of 6</span>
          <span className="text-xs text-muted-foreground">{WIZARD_STEPS[wizardStep - 1].label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gold transition-all duration-300" style={{ width: `${(wizardStep / 6) * 100}%` }} />
        </div>
      </div>
      {/* Desktop full stepper */}
      <div className="hidden sm:flex items-center gap-1">
        {WIZARD_STEPS.map((s, i) => {
          const isActive = wizardStep === s.n;
          const isComplete = maxStepReached > s.n && !isActive;
          const canJump = s.n <= maxStepReached;
          return (
            <div key={s.n} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && setWizardStep(s.n)}
                className={`group flex items-center gap-2 min-w-0 ${canJump ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
              >
                <span
                  className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-full border text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-gold text-gold-foreground border-gold shadow-sm scale-105'
                      : isComplete
                        ? 'bg-gold/15 text-gold border-gold/40'
                        : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : s.n}
                </span>
                <span
                  className={`truncate text-[10px] font-medium tracking-[0.08em] uppercase ${
                    isActive ? 'text-foreground' : isComplete ? 'text-gold' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 mx-1 text-muted-foreground/40 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {Stepper}

      {/* ============ STEP 1: Client & Listing Info ============ */}
      {wizardStep === 1 && (
        <div className="space-y-6">
          {hasFUB && (
            <Card className="border-gold/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-gold" /> Link to Client (Follow Up Boss)
                  <span className="text-xs text-muted-foreground font-normal">(optional)</span>
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
          <Card className="border-gold/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-serif">
                <User className="h-4 w-4 text-gold" /> Client & Listing Info
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Client Name *</Label>
                <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Jane & John Smith" />
              </div>
              <div>
                <Label>Agent Name</Label>
                <Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <Label>Intended List Date</Label>
                <Input type="date" value={intendedListDate} onChange={e => setIntendedListDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <StepWarnings step={1} />
        </div>
      )}

      {/* ============ STEP 2: Subject Property ============ */}
      {wizardStep === 2 && (
        <div className="space-y-6">
          <Card className="border-gold/20">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2 font-serif">
                  <Home className="h-4 w-4 text-gold" /> Subject Property
                </CardTitle>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleListingPdfUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <span
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-gold text-gold-foreground hover:bg-gold/90 cursor-pointer transition-colors shadow-sm ${extractingListing ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    {extractingListing
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
                      : <><FileText className="h-4 w-4" /> Upload Listing (PDF)</>}
                  </span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Upload an MLS listing PDF to auto-fill the fields below. You can edit anything after.
              </p>
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
                <Input value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="e.g. 5+1" />
              </div>
              <div>
                <Label>Bathrooms</Label>
                <Input value={bathrooms} onChange={e => setBathrooms(e.target.value)} placeholder="e.g. 4 or 3 full, 1 half" />
              </div>
              <div>
                <Label>Above-Grade Sq Ft</Label>
                <Input type="number" value={aboveGradeSqFt} onChange={e => setAboveGradeSqFt(e.target.value)} placeholder="1500" />
              </div>
              <div>
                <Label>Finished Basement Sq Ft</Label>
                <Input type="number" value={finishedBasementSqFt} onChange={e => setFinishedBasementSqFt(e.target.value)} placeholder="600" />
              </div>
              <div>
                <Label>Total Finished Sq Ft</Label>
                <Input type="number" value={sqft} onChange={e => setSqft(e.target.value)} placeholder="1800" />
              </div>
              <div>
                <Label>Garage</Label>
                <Select value={garage || 'unknown'} onValueChange={v => setGarage(v === 'unknown' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">—</SelectItem>
                    <SelectItem value="single attached">Single attached</SelectItem>
                    <SelectItem value="double attached">Double attached</SelectItem>
                    <SelectItem value="triple attached">Triple attached</SelectItem>
                    <SelectItem value="single detached">Single detached</SelectItem>
                    <SelectItem value="double detached">Double detached</SelectItem>
                    <SelectItem value="carport">Carport</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Build Year / Age Range</Label>
                <Input value={buildYear} onChange={e => setBuildYear(e.target.value)} placeholder="e.g. 2005 or 16-30" />
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={condition || 'Good'} onValueChange={setCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Excellent">Excellent</SelectItem>
                    <SelectItem value="Very Good">Very Good</SelectItem>
                    <SelectItem value="Good">Good</SelectItem>
                    <SelectItem value="Fair">Fair</SelectItem>
                    <SelectItem value="Needs Work">Needs work</SelectItem>
                    <SelectItem value="Renovated Throughout">Renovated throughout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target List Price</Label>
                <Input type="number" value={targetListPrice} onChange={e => setTargetListPrice(e.target.value)} placeholder="750000" />
              </div>
              <div className="sm:col-span-2">
                <Label>Key Features</Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  One per line. Include standouts that drive pricing adjustments — pool, ravine/waterfront lot, walkout basement, in-law suite, premium finishes, renovations.
                </p>
                <Textarea
                  value={keyFeaturesText}
                  onChange={e => setKeyFeaturesText(e.target.value)}
                  rows={5}
                  placeholder={"In-ground pool\nBacks onto ravine\nFully finished basement\nAttached double garage\nHardwood throughout"}
                />
              </div>
            </CardContent>
          </Card>
          <CMAPhotoUpload
            photos={subjectPhotos}
            setPhotos={setSubjectPhotos}
            coverIndex={coverPhotoIndex}
            setCoverIndex={setCoverPhotoIndex}
          />
          <StepWarnings step={2} />
        </div>
      )}

      {/* ============ STEP 3: Purchase History (optional) ============ */}
      {wizardStep === 3 && (
        <div className="space-y-6">
          <Card className="border-gold/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-serif">
                <DollarSign className="h-4 w-4 text-gold" /> Client Purchase History
                <span className="text-xs text-muted-foreground font-normal">(optional — skip if unknown)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Purchase Price</Label>
                <Input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="500000" />
              </div>
              <div>
                <Label>Purchase Date</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <CMAImprovements items={improvementsList} onChange={setImprovementsList} />
          <StepWarnings step={3} />
        </div>
      )}

      {/* ============ STEP 4: Comparables ============ */}
      {wizardStep === 4 && (
        <div className="space-y-6">
          <Card className="border-gold/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-serif">
                <FileUp className="h-4 w-4 text-gold" /> Import Comparables
                <span className="text-xs text-muted-foreground font-normal">(choose one method)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setImportMethod('pdf')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${importMethod === 'pdf' ? 'border-gold bg-gold/10 text-foreground' : 'border-border hover:border-gold/40 text-muted-foreground'}`}>
                  <Upload className="h-5 w-5" />
                  <span className="text-xs font-medium">Upload PDF</span>
                </button>
                <button type="button" onClick={() => setImportMethod('link')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${importMethod === 'link' ? 'border-gold bg-gold/10 text-foreground' : 'border-border hover:border-gold/40 text-muted-foreground'}`}>
                  <Link2 className="h-5 w-5" />
                  <span className="text-xs font-medium">CloudCMA Link</span>
                </button>
                <button type="button" onClick={() => setImportMethod('manual')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${importMethod === 'manual' ? 'border-gold bg-gold/10 text-foreground' : 'border-border hover:border-gold/40 text-muted-foreground'}`}>
                  <PenLine className="h-5 w-5" />
                  <span className="text-xs font-medium">Manual Entry</span>
                </button>
              </div>
              {importMethod === 'pdf' && (
                <div className="border-2 border-dashed border-gold/20 rounded-lg p-6 text-center">
                  <input type="file" accept=".pdf" id="cma-pdf-upload" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.type !== 'application/pdf') { toast.error('Only PDF files are accepted'); return; }
                        setCmaPdf(file);
                      }
                    }} />
                  <label htmlFor="cma-pdf-upload" className="cursor-pointer">
                    <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    {cmaPdf ? <p className="text-sm text-gold font-medium">{cmaPdf.name}</p>
                      : <p className="text-sm text-muted-foreground">Click to upload CloudCMA PDF</p>}
                  </label>
                </div>
              )}
              {importMethod === 'link' && (
                <div className="space-y-2">
                  <Label>CloudCMA Report Link</Label>
                  <Input value={cmaSourceUrl} onChange={e => setCmaSourceUrl(e.target.value)} placeholder="Paste CloudCMA share link here" type="url" />
                </div>
              )}
              {(importMethod === 'pdf' || importMethod === 'link') && (
                <Button onClick={handleExtractComps} disabled={extracting || (importMethod === 'pdf' ? !cmaPdf : !cmaSourceUrl)}
                  className="bg-gold hover:bg-gold/90 text-gold-foreground">
                  {extracting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting…</>
                    : <><Sparkles className="h-4 w-4 mr-2" /> {hasExtracted ? 'Re-extract Comps' : 'Extract Comps'}</>}
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between px-1">
            <div className="text-sm font-medium text-foreground">
              {reviewComps.filter(c => !c.excluded).length} comparable{reviewComps.filter(c => !c.excluded).length === 1 ? '' : 's'} added
            </div>
            <div className="text-xs text-muted-foreground">
              Sold: {reviewComps.filter(c => !c.excluded && c.comp_category === 'sold').length}
              {' · '}Pending: {reviewComps.filter(c => !c.excluded && c.comp_category === 'pending').length}
              {' · '}Active: {reviewComps.filter(c => !c.excluded && c.comp_category === 'active').length}
            </div>
          </div>

          <CMACompReview
            comps={reviewComps}
            onCompsChange={setReviewComps}
            onReRunExtraction={handleReRunExtraction}
            isExtracting={extracting}
            onConfirm={() => nextStep()}
            onBack={prevStep}
            isSubmitting={false}
            extractionSummary={extractionSummary}
            confirmLabel="Continue to Agent Notes"
            backLabel="Back"
          />
          <StepWarnings step={4} />
        </div>
      )}

      {/* ============ STEP 5: Agent Notes ============ */}
      {wizardStep === 5 && (
        <div className="space-y-6">
        <Card className="border-gold/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-serif">
              <PenLine className="h-4 w-4 text-gold" /> Agent Notes
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={agentNotes}
              onChange={e => setAgentNotes(e.target.value)}
              rows={10}
              placeholder="Any additional context — buyer intelligence, seller circumstances, prior offers, structural concerns, competing listings, motivation, timing pressure, condition observations, etc. Claude will factor this into the Opinion of Value and pricing rationale."
              className="min-h-[220px]"
            />
          </CardContent>
        </Card>
        <StepWarnings step={5} />
        </div>
      )}

      {/* ============ STEP 6: Review & Generate ============ */}
      {wizardStep === 6 && (
        <div className="space-y-4">
        <Card className="border-gold/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-serif">
              <ClipboardList className="h-4 w-4 text-gold" /> Review & Generate
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Review the details below. Click any completed step above to jump back and edit.</p>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Client & Listing</h3>
                <button className="text-[11px] text-gold hover:underline" onClick={() => setWizardStep(1)}>Edit</button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 rounded-md bg-muted/30 p-3">
                <div><span className="text-muted-foreground text-xs">Client:</span> <span className="font-medium">{clientName || '—'}</span></div>
                <div><span className="text-muted-foreground text-xs">Agent:</span> <span className="font-medium">{agentName || '—'}</span></div>
                <div><span className="text-muted-foreground text-xs">List date:</span> <span className="font-medium">{intendedListDate || '—'}</span></div>
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Subject Property</h3>
                <button className="text-[11px] text-gold hover:underline" onClick={() => setWizardStep(2)}>Edit</button>
              </div>
              <div className="rounded-md bg-muted/30 p-3 space-y-1">
                <div className="font-medium">{propertyAddress || '—'}{cityArea ? `, ${cityArea}` : ''}</div>
                <div className="text-xs text-muted-foreground">
                  {propertyType} · {bedrooms || '—'} bed · {bathrooms || '—'} bath · {sqft || aboveGradeSqFt || '—'} sqft
                  {buildYear ? ` · Built ${buildYear}` : ''} · {condition || '—'}
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Target list price:</span>{' '}
                  <span className="font-medium text-foreground">{targetListPrice ? fmtCurrency(targetListPrice) : '—'}</span>
                </div>
                {keyFeaturesText.trim() && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Key features:</span>{' '}
                    <span className="text-foreground">
                      {keyFeaturesText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4).join(' · ')}
                      {keyFeaturesText.split('\n').filter(s => s.trim()).length > 4 ? ' …' : ''}
                    </span>
                  </div>
                )}
              </div>
            </section>
            {(purchasePrice || purchaseDate || improvementsList.length > 0) && (
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Purchase History</h3>
                  <button className="text-[11px] text-gold hover:underline" onClick={() => setWizardStep(3)}>Edit</button>
                </div>
                <div className="grid sm:grid-cols-3 gap-2 rounded-md bg-muted/30 p-3 text-xs">
                  <div><span className="text-muted-foreground">Price:</span> <span className="font-medium">{purchasePrice ? fmtCurrency(purchasePrice) : '—'}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{purchaseDate || '—'}</span></div>
                  <div><span className="text-muted-foreground">Improvements:</span> <span className="font-medium">{getImprovementsTotal() ? fmtCurrency(getImprovementsTotal()) : '—'}</span></div>
                </div>
              </section>
            )}
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Comparables</h3>
                <button className="text-[11px] text-gold hover:underline" onClick={() => setWizardStep(4)}>Edit</button>
              </div>
              <div className="rounded-md bg-muted/30 p-3 text-xs">
                <span className="font-medium text-foreground">{reviewComps.filter(c => !c.excluded).length} comparables</span>
                <span className="text-muted-foreground">
                  {' '}(Sold: {reviewComps.filter(c => !c.excluded && c.comp_category === 'sold').length},{' '}
                  Pending: {reviewComps.filter(c => !c.excluded && c.comp_category === 'pending').length},{' '}
                  Active: {reviewComps.filter(c => !c.excluded && c.comp_category === 'active').length})
                </span>
              </div>
            </section>
            {agentNotes.trim() && (
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Agent Notes</h3>
                  <button className="text-[11px] text-gold hover:underline" onClick={() => setWizardStep(5)}>Edit</button>
                </div>
                <div className="rounded-md bg-muted/30 p-3 text-xs text-foreground whitespace-pre-wrap">
                  {agentNotes.slice(0, 500)}{agentNotes.length > 500 ? '…' : ''}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
        {(() => {
          const groups = allWarnings();
          if (groups.length === 0) return null;
          return (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <div className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <span aria-hidden>⚠</span> Heads up before generating
              </div>
              <ul className="text-xs text-amber-700/90 dark:text-amber-400/90 space-y-1.5">
                {groups.map(g => (
                  <li key={g.step} className="flex flex-wrap items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(g.step)}
                      className="font-medium underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300"
                    >
                      Step {g.step} · {g.label}
                    </button>
                    <span className="text-muted-foreground">— {g.warnings.join('; ')}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground pt-1">
                You can still generate — these are quality suggestions, not blockers.
              </p>
            </div>
          );
        })()}
        </div>
      )}

      {/* ============ Wizard Footer ============ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border/40">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isProcessing}>Cancel</Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isProcessing}
          >
            {saving && !analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Draft
          </Button>
        </div>
        <div className="flex gap-2">
          {wizardStep > 1 && wizardStep !== 4 && (
            <Button variant="outline" onClick={prevStep} disabled={isProcessing}>Back</Button>
          )}
          {wizardStep === 3 && (
            <Button variant="ghost" onClick={nextStep} disabled={isProcessing} className="text-muted-foreground">
              Skip
            </Button>
          )}
          {wizardStep < 6 && wizardStep !== 4 && (
            <Button
              onClick={handleNext}
              disabled={isProcessing}
              className="bg-gold hover:bg-gold/90 text-gold-foreground"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {wizardStep === 6 && (
            <Button
              onClick={handleConfirmAndAnalyze}
              disabled={isProcessing}
              className="bg-gold hover:bg-gold/90 text-gold-foreground"
            >
              {analyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
                : <><Sparkles className="h-4 w-4 mr-2" /> Generate CMA</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CMAInputForm;
