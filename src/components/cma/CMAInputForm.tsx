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
import { Upload, Loader2, Home, DollarSign, BarChart3, FileUp, Users, Link2, PenLine } from 'lucide-react';
import { FUBContactTypeahead } from '@/components/FUBContactTypeahead';
import { useHasFUB } from '@/hooks/useHasFUB';
import CMACompReview, { type ReviewComp, type ExtractionSummary } from './CMACompReview';
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
  const [improvementsList, setImprovementsList] = useState<ImprovementItem[]>([]);

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
      setPurchasePrice(r.purchase_price?.toString() || '');
      setPurchaseDate(r.purchase_date || '');
      setImprovements(r.improvements_invested?.toString() || '');
      setImprovementsList(Array.isArray(r.improvements_list) ? r.improvements_list : []);
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
      // Load existing comps for review
      if (Array.isArray(r.extracted_comps) && r.extracted_comps.length > 0) {
        setReviewComps(r.extracted_comps.map((c: any) => ({
          id: c.id || crypto.randomUUID(),
          address: c.address || '',
          comp_category: c.comp_category || 'sold',
          list_price: c.list_price ?? null,
          sold_price: c.sold_price ?? null,
          sale_date: c.sale_date ?? null,
          days_on_market: c.days_on_market ?? null,
          beds: c.beds ?? null,
          baths: c.baths ?? null,
          sqft: c.sqft ?? null,
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
    },
    purchaseHistory: {
      purchasePrice: parseFloat(purchasePrice),
      purchaseDate,
      improvements: getImprovementsTotal(),
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
    existingManualComps: manualComps.filter(c => c._manual_edit),
  });

  const runExtraction = async (): Promise<{ comps: ReviewComp[]; summary: ExtractionSummary | null }> => {
    if (!cmaPdf) return { comps: [], summary: null };
    const startTime = Date.now();
    const pdfText = await extractPdfText(cmaPdf);
    const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-analyze', {
      body: buildRequestBody(pdfText, reviewComps),
    });
    if (fnError) throw fnError;
    if (!fnData?.success || !fnData.analysis?.extracted_comps) {
      toast.error(fnData?.error || 'Extraction failed');
      return { comps: [], summary: null };
    }
    const aiComps: any[] = fnData.analysis.extracted_comps || [];
    const summary: ExtractionSummary = fnData.analysis.extraction_summary || {
      total_comps_found: aiComps.length,
      sold_count: aiComps.filter((c: any) => c.comp_category === 'sold').length,
      active_count: aiComps.filter((c: any) => c.comp_category === 'active').length,
      expired_count: aiComps.filter((c: any) => c.comp_category === 'expired').length,
      low_confidence_count: aiComps.filter((c: any) => (c.confidence ?? 1) < 0.5).length,
      needs_review_count: aiComps.filter((c: any) => c.needs_review).length,
      extraction_passes: 1,
    };

    // Log import to cma_import_logs
    if (user) {
      const durationMs = Date.now() - startTime;
      supabase.from('cma_import_logs').insert({
        user_id: user.id,
        file_name: cmaPdf.name,
        file_size_bytes: cmaPdf.size,
        total_blocks_detected: summary.total_comps_found,
        comps_imported: aiComps.filter((c: any) => !c.needs_review).length,
        comps_partial: aiComps.filter((c: any) => c.needs_review).length,
        comps_skipped: 0,
        skip_reasons: [],
        extraction_passes: summary.extraction_passes,
        extraction_duration_ms: durationMs,
        raw_text_length: pdfText.length,
      } as any).then(() => {});
    }

    const mappedComps = aiComps.map((c: any) => ({
      id: crypto.randomUUID(),
      address: c.address || '',
      comp_category: c.comp_category || 'sold',
      list_price: c.list_price ?? null,
      sold_price: c.sold_price ?? null,
      sale_date: c.sale_date ?? null,
      days_on_market: c.days_on_market ?? null,
      beds: c.beds ?? null,
      baths: c.baths ?? null,
      sqft: c.sqft ?? null,
      notes: null,
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

    return { comps: mappedComps, summary };
  };

  // Extract from CloudCMA link
  const runLinkExtraction = async (): Promise<{ comps: ReviewComp[]; summary: ExtractionSummary | null }> => {
    if (!cmaSourceUrl) return { comps: [], summary: null };
    
    const startTime = Date.now();
    const { data: fnData, error: fnError } = await supabase.functions.invoke('cma-scrape-link', {
      body: { url: cmaSourceUrl, subjectAddress: propertyAddress },
    });

    if (fnError) throw fnError;
    
    if (!fnData?.success) {
      toast.error(fnData?.error || 'Link extraction failed. You can still add comparables manually.');
      return { comps: [], summary: null };
    }

    const aiComps: any[] = fnData.extracted_comps || [];
    const summary: ExtractionSummary = fnData.extraction_summary || {
      total_comps_found: aiComps.length,
      sold_count: aiComps.filter((c: any) => c.comp_category === 'sold').length,
      active_count: aiComps.filter((c: any) => c.comp_category === 'active').length,
      expired_count: aiComps.filter((c: any) => c.comp_category === 'expired').length,
      low_confidence_count: aiComps.filter((c: any) => (c.confidence ?? 1) < 0.5).length,
      needs_review_count: aiComps.filter((c: any) => c.needs_review).length,
      extraction_passes: 1,
    };

    // Log import
    if (user) {
      const durationMs = Date.now() - startTime;
      supabase.from('cma_import_logs').insert({
        user_id: user.id,
        source_type: 'link',
        cma_source_url: cmaSourceUrl,
        total_blocks_detected: summary.total_comps_found,
        comps_imported: aiComps.filter((c: any) => !c.needs_review).length,
        comps_partial: aiComps.filter((c: any) => c.needs_review).length,
        comps_skipped: 0,
        skip_reasons: [],
        extraction_passes: 1,
        extraction_duration_ms: durationMs,
      } as any).then(() => {});
    }

    const mappedComps = aiComps.map((c: any) => ({
      id: crypto.randomUUID(),
      address: c.address || '',
      comp_category: c.comp_category || 'sold',
      list_price: c.list_price ?? null,
      sold_price: c.sold_price ?? null,
      sale_date: c.sale_date ?? null,
      days_on_market: c.days_on_market ?? null,
      beds: c.beds ?? null,
      baths: c.baths ?? null,
      sqft: c.sqft ?? null,
      notes: null,
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

  // Step 1: Move to review (extract if PDF/link present, else empty review)
  const handleProceedToReview = async () => {
    if (!propertyAddress || !cityArea || !purchasePrice || !purchaseDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!hasMarketStats()) {
      toast.error('Please provide market stats before proceeding');
      return;
    }

    // Extract from PDF
    if (importMethod === 'pdf' && cmaPdf) {
      setExtracting(true);
      try {
        const { comps: extracted, summary } = await runExtraction();
        setReviewComps(extracted);
        setExtractionSummary(summary);
        const reviewCount = extracted.filter(c => c.needs_review).length;
        toast.success(`Extracted ${extracted.length} comps from PDF${reviewCount > 0 ? ` (${reviewCount} need review)` : ''}`);
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
        const { comps: extracted, summary } = await runLinkExtraction();
        setReviewComps(extracted);
        setExtractionSummary(summary);
        const reviewCount = extracted.filter(c => c.needs_review).length;
        toast.success(`Extracted ${extracted.length} comps from link${reviewCount > 0 ? ` (${reviewCount} need review)` : ''}`);
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
      const manualComps = reviewComps.filter(c => c._manual_edit);
      const { comps: extracted, summary } = await runExtraction();
      // Merge: keep all manual comps, add new AI comps not duplicating manual addresses
      const manualAddresses = new Set(manualComps.map(c => c.address.toLowerCase().trim()));
      const newAiComps = extracted.filter(c => !c._manual_edit && !manualAddresses.has(c.address.toLowerCase().trim()));
      setReviewComps([...manualComps, ...newAiComps]);
      setExtractionSummary(summary);
      toast.success(`Re-extracted. ${newAiComps.length} new comps added, ${manualComps.length} manual comps preserved.`);
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
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseInt(bathrooms) : null,
        approx_sqft: sqft ? parseInt(sqft) : null,
        target_list_price: targetListPrice ? parseFloat(targetListPrice) : null,
        intended_list_date: intendedListDate || null,
        purchase_price: parseFloat(purchasePrice),
        purchase_date: purchaseDate,
        improvements_invested: getImprovementsTotal(),
        improvements_list: improvementsList,
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
        const pp = parseFloat(purchasePrice);
        const imp = getImprovementsTotal();
        const eqLow = a.pricing_band_low ? a.pricing_band_low - pp - imp : null;
        const eqHigh = a.pricing_band_high ? a.pricing_band_high - pp - imp : null;

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
          talking_points: a.talking_points || [],
          seller_objections: a.seller_objections || [],
          strategy_recommendation: a.strategy_recommendation,
          market_narrative: a.market_narrative,
          equity_gain_low: eqLow,
          equity_gain_high: eqHigh,
          ai_raw_response: fnData.analysis,
        }).eq('id', reportId);

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
    if (!propertyAddress || !cityArea || !purchasePrice || !purchaseDate) {
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
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseInt(bathrooms) : null,
        approx_sqft: sqft ? parseInt(sqft) : null,
        target_list_price: targetListPrice ? parseFloat(targetListPrice) : null,
        intended_list_date: intendedListDate || null,
        purchase_price: parseFloat(purchasePrice),
        purchase_date: purchaseDate,
        improvements_invested: getImprovementsTotal(),
        improvements_list: improvementsList,
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

  // ============= STEP 2: REVIEW COMPS =============
  if (step === 'review') {
    return (
      <CMACompReview
        comps={reviewComps}
        onCompsChange={setReviewComps}
        onReRunExtraction={handleReRunExtraction}
        isExtracting={extracting}
        onConfirm={handleConfirmAndAnalyze}
        onBack={() => setStep('input')}
        isSubmitting={analyzing}
        extractionSummary={extractionSummary}
      />
    );
  }

  // ============= STEP 1: INPUT FORM =============
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
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Purchase Price *</Label>
            <Input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="500000" />
          </div>
          <div>
            <Label>Purchase Date *</Label>
            <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Improvements & Upgrades */}
      <CMAImprovements items={improvementsList} onChange={setImprovementsList} />

      {/* Comparable Import Method */}
      <Card className="border-gold/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="h-4 w-4 text-gold" /> Import Comparables
            <span className="text-xs text-muted-foreground font-normal">(choose one method)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Method selector */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setImportMethod('pdf')}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${
                importMethod === 'pdf'
                  ? 'border-gold bg-gold/10 text-foreground'
                  : 'border-border hover:border-gold/40 text-muted-foreground'
              }`}
            >
              <Upload className="h-5 w-5" />
              <span className="text-xs font-medium">Upload PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setImportMethod('link')}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${
                importMethod === 'link'
                  ? 'border-gold bg-gold/10 text-foreground'
                  : 'border-border hover:border-gold/40 text-muted-foreground'
              }`}
            >
              <Link2 className="h-5 w-5" />
              <span className="text-xs font-medium">CloudCMA Link</span>
            </button>
            <button
              type="button"
              onClick={() => setImportMethod('manual')}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${
                importMethod === 'manual'
                  ? 'border-gold bg-gold/10 text-foreground'
                  : 'border-border hover:border-gold/40 text-muted-foreground'
              }`}
            >
              <PenLine className="h-5 w-5" />
              <span className="text-xs font-medium">Manual Entry</span>
            </button>
          </div>

          {/* PDF Upload */}
          {importMethod === 'pdf' && (
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
          )}

          {/* CloudCMA Link */}
          {importMethod === 'link' && (
            <div className="space-y-2">
              <Label>CloudCMA Report Link</Label>
              <Input
                value={cmaSourceUrl}
                onChange={e => setCmaSourceUrl(e.target.value)}
                placeholder="Paste CloudCMA share link here"
                type="url"
              />
              <p className="text-[10px] text-muted-foreground">
                Paste the share link from your CloudCMA report. The system will automatically extract all comparable properties.
              </p>
            </div>
          )}

          {/* Manual */}
          {importMethod === 'manual' && (
            <div className="rounded-lg bg-muted/30 p-4 text-center">
              <PenLine className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                You'll add comparables manually in the next step.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subject Property Photos */}
      <CMAPhotoUpload
        photos={subjectPhotos}
        setPhotos={setSubjectPhotos}
        coverIndex={coverPhotoIndex}
        setCoverIndex={setCoverPhotoIndex}
      />

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
          onClick={handleSaveDraft}
          disabled={isProcessing}
        >
          {saving && !analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {isEditMode ? 'Save Draft' : 'Save Draft'}
        </Button>
        <Button
          onClick={handleProceedToReview}
          disabled={isProcessing}
          className="bg-gold hover:bg-gold/90 text-gold-foreground"
        >
          {extracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {extracting ? 'Extracting Comps...' : 'Review Comps & Analyze'}
        </Button>
      </div>
    </div>
  );
};

export default CMAInputForm;
