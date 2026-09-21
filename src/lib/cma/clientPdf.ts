import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { tenant } from '@/config/tenant';
import {
  cleanText,
  compactMoney,
  compPrice,
  compSqftLabel,
  compStatus,
  formatAdjustmentRange,
  humanizeLabel,
  money,
  normalizeAddress,
  shouldShowAdjustment,
  sqftLabel,
  toPositiveNumber,
} from '@/lib/cma/reportQuality';

/**
 * Branded, client-ready CMA PDF. It consumes the saved/audited numbers and never
 * rewrites comp prices or the approved opinion of value.
 */

export interface CmaPdfComp {
  address: string;
  area?: string | null;
  beds?: number | string | null;
  baths?: number | string | null;
  list_price?: number | string | null;
  sold_price?: number | string | null;
  days_on_market?: number | string | null;
  sale_date?: string | null;
  is_weak?: boolean | null;
  weak_reason?: string | null;
  comp_category?: string | null;
  status?: string | null;
  sqft?: number | string | null;
  sqFt?: number | string | null;
  ag_sqft?: number | string | null;
  bg_sqft?: number | string | null;
  notes?: string | null;
}

export interface CmaPdfInput {
  propertyAddress: string;
  cityArea?: string | null;
  propertyType?: string | null;
  createdAt: string;
  agentName?: string | null;
  clientName?: string | null;
  executiveSummary?: string | null;
  priceNarrative?: string | null;
  marketConditions?: string | null;
  strategy?: string | null;
  pricingBandLow?: number | null;
  pricingBandRecommended?: number | null;
  pricingBandHigh?: number | null;
  pricingConfidence?: string | null;
  cmaGrade?: string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  aboveGradeSqFt?: number | null;
  finishedBasementSqFt?: number | null;
  approxSqFt?: number | null;
  garage?: string | null;
  buildYear?: number | string | null;
  condition?: string | null;
  keyFeatures?: string[];
  featureAdjustments?: Array<{ feature?: string; adjustment_low?: number | null; adjustment_high?: number | null; rationale?: string | null }>;
  pricePerSqftCrossCheck?: {
    comps_used?: Array<{ address?: string | null; above_grade_sqft?: number | null; total_finished_sqft?: number | null; sold_price?: number | null; price_per_sqft?: number | null }> | string[] | null;
    implied_low?: number | null;
    implied_high?: number | null;
    verdict?: string | null;
    commentary?: string | null;
    omitted_count?: number | null;
  } | null;
  valuationScenarios?: Record<string, { price?: number | null; rationale?: string | null } | number | null> | null;
  marketStats?: Record<string, unknown> | null;
  comps: CmaPdfComp[];
}

export function formatCmaDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

const INK = [28, 28, 28] as const;
const MUTED = [98, 91, 84] as const;
const GOLD = [179, 138, 90] as const;
const TAUPE = [199, 184, 166] as const;
const IVORY = [246, 241, 234] as const;
const WHITE = [255, 255, 255] as const;
const PAGE_W = 612;
const PAGE_H = 792;
const M = 48;
const CONTENT_W = PAGE_W - M * 2;

type Point = [number, number, number];

function setColor(doc: jsPDF, color: Point) { doc.setTextColor(color[0], color[1], color[2]); }
function setFill(doc: jsPDF, color: Point) { doc.setFillColor(color[0], color[1], color[2]); }
function setStroke(doc: jsPDF, color: Point) { doc.setDrawColor(color[0], color[1], color[2]); }

function writeWrapped(doc: jsPDF, text: unknown, x: number, y: number, maxWidth: number, opts: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: Point; lineHeight?: number; maxLines?: number } = {}) {
  const body = cleanText(text);
  if (!body) return y;
  doc.setFont('helvetica', opts.style || 'normal');
  doc.setFontSize(opts.size || 10);
  setColor(doc, opts.color || INK);
  const lines = doc.splitTextToSize(body, maxWidth).slice(0, opts.maxLines || 99);
  const lineHeight = opts.lineHeight || (opts.size || 10) + 4;
  lines.forEach((line: string) => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function addPageTitle(doc: jsPDF, pageNo: number, title: string, kicker?: string) {
  if (pageNo > 1) doc.addPage();
  setColor(doc, GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text((kicker || 'HOME EVALUATION').toUpperCase(), M, M);
  setColor(doc, INK);
  doc.setFont('times', 'normal');
  doc.setFontSize(28);
  doc.text(title, M, M + 34);
  setStroke(doc, GOLD);
  doc.setLineWidth(1.2);
  doc.line(M, M + 48, PAGE_W - M, M + 48);
  return M + 78;
}

function statBox(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, highlight = false) {
  setFill(doc, highlight ? IVORY : WHITE);
  setStroke(doc, highlight ? GOLD : TAUPE);
  doc.roundedRect(x, y, w, 76, 3, 3, 'FD');
  setColor(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), x + 12, y + 18);
  setColor(doc, highlight ? GOLD : INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(value.length > 18 ? 13 : 17);
  doc.text(value, x + 12, y + 45, { maxWidth: w - 24 });
}

function footer(doc: jsPDF, input: CmaPdfInput) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setStroke(doc, TAUPE);
    doc.setLineWidth(0.4);
    doc.line(M, PAGE_H - 42, PAGE_W - M, PAGE_H - 42);
    setColor(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${tenant.brokerageName}${input.agentName ? ` · ${input.agentName}` : ''}`, M, PAGE_H - 26);
    doc.text(`${i} / ${pages}`, PAGE_W - M, PAGE_H - 26, { align: 'right' });
  }
}

function scenarioEntries(input: CmaPdfInput) {
  const raw = input.valuationScenarios || {};
  return [
    ['Conservative', raw.conservative],
    ['Most probable', raw.most_probable],
    ['Optimistic', raw.optimistic],
  ].map(([label, value]) => ({
    label,
    price: typeof value === 'number' ? value : value?.price ?? null,
    rationale: typeof value === 'object' && value ? cleanText(value.rationale) : '',
  })).filter((s) => s.price != null || s.rationale);
}

function statusPriceLabel(comp: CmaPdfComp) {
  const status = compStatus(comp);
  const price = status === 'Sold' ? money(comp.sold_price) : money(comp.list_price);
  return `${status}: ${price}`;
}

export function buildCmaClientPdf(input: CmaPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const subjectArea = toPositiveNumber(input.aboveGradeSqFt) || toPositiveNumber(input.approxSqFt);
  const totalFinished = subjectArea && toPositiveNumber(input.finishedBasementSqFt)
    ? subjectArea + (toPositiveNumber(input.finishedBasementSqFt) || 0)
    : toPositiveNumber(input.approxSqFt) || subjectArea;
  const comps = input.comps.filter(c => !c.is_weak).slice(0, 10);
  const soldComps = comps.filter(c => toPositiveNumber(c.sold_price));
  const adjustments = (input.featureAdjustments || []).filter(shouldShowAdjustment);
  const scenarios = scenarioEntries(input);
  const stats = input.marketStats || {};

  // 1. Cover
  setFill(doc, INK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  setColor(doc, GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('LUXE REALTY GROUP', M, 88);
  doc.text('HOME EVALUATION', M, 122);
  setColor(doc, WHITE);
  doc.setFont('times', 'normal');
  doc.setFontSize(42);
  writeWrapped(doc, normalizeAddress(input.propertyAddress), M, 188, CONTENT_W, { size: 42, style: 'normal', color: WHITE, lineHeight: 44, maxLines: 3 });
  setColor(doc, IVORY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text([input.cityArea, input.propertyType].filter(Boolean).map(cleanText).join(' · '), M, 354);
  doc.text(`Prepared for ${cleanText(input.clientName) || 'our client'}`, M, 392);
  doc.text(`Prepared by ${cleanText(input.agentName) || tenant.brokerageName}`, M, 416);
  doc.text(formatCmaDate(input.createdAt), M, 440);
  setColor(doc, GOLD);
  doc.setFont('times', 'bold');
  doc.setFontSize(32);
  doc.text(money(input.pricingBandRecommended), M, 592);
  setColor(doc, IVORY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Evaluator’s Opinion of Value', M, 616);

  // 2. Snapshot
  let y = addPageTitle(doc, 2, 'Property Snapshot');
  statBox(doc, M, y, 156, 'Bedrooms', cleanText(input.bedrooms) || 'Not reported');
  statBox(doc, M + 180, y, 156, 'Bathrooms', cleanText(input.bathrooms) || 'Not reported');
  statBox(doc, M + 360, y, 156, 'Finished area', sqftLabel(totalFinished));
  y += 100;
  statBox(doc, M, y, 156, 'Above grade', sqftLabel(subjectArea));
  statBox(doc, M + 180, y, 156, 'Basement', sqftLabel(input.finishedBasementSqFt));
  statBox(doc, M + 360, y, 156, 'Garage', humanizeLabel(input.garage) || 'Not reported');
  y += 112;
  if (input.keyFeatures?.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(doc, INK); doc.text('Key value signals', M, y); y += 18;
    input.keyFeatures.slice(0, 8).forEach((item) => { y = writeWrapped(doc, `• ${item}`, M, y, CONTENT_W, { size: 10, color: MUTED, lineHeight: 14 }); });
  }
  y += 16;
  y = writeWrapped(doc, input.executiveSummary, M, y, CONTENT_W, { size: 11, color: INK, lineHeight: 16, maxLines: 18 });

  // 3. Market
  y = addPageTitle(doc, 3, 'Market Snapshot');
  statBox(doc, M, y, 160, 'CMA grade', cleanText(input.cmaGrade) || 'Not stated', true);
  statBox(doc, M + 178, y, 160, 'Confidence', cleanText(input.pricingConfidence) || 'Not stated');
  statBox(doc, M + 356, y, 160, 'Sale-to-list', stats.sale_to_list_ratio != null ? `${stats.sale_to_list_ratio}%` : 'Not reported');
  y += 104;
  y = writeWrapped(doc, input.marketConditions, M, y, CONTENT_W, { size: 10, color: INK, lineHeight: 15, maxLines: 24 });
  if (stats.avg_days_on_market || stats.median_sale_price) {
    y += 18;
    statBox(doc, M, y, 246, 'Median sale price', money(stats.median_sale_price));
    statBox(doc, M + 270, y, 246, 'Days on market', stats.avg_days_on_market != null ? String(stats.avg_days_on_market) : 'Not reported');
  }

  // 4. Comparison table
  y = addPageTitle(doc, 4, 'Comparable Properties', `${comps.length} reviewed properties`);
  autoTable(doc, {
    startY: y,
    head: [['Address', 'Status', 'Beds/Baths', 'Sq ft', 'List', 'Sold', 'DOM']],
    body: comps.map(c => [
      normalizeAddress(c.address),
      compStatus(c),
      `${cleanText(c.beds) || '—'} / ${cleanText(c.baths) || '—'}`,
      compSqftLabel(c),
      money(c.list_price),
      money(c.sold_price),
      cleanText(c.days_on_market) || '—',
    ]),
    theme: 'grid',
    styles: { fontSize: 8.4, cellPadding: 4, textColor: INK as any, lineColor: TAUPE as any, lineWidth: 0.4 },
    headStyles: { fillColor: INK as any, textColor: WHITE as any, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: IVORY as any },
    margin: { left: M, right: M },
  });

  // 5-7. Comp cards
  for (let page = 0; page < Math.ceil(comps.length / 4); page++) {
    y = addPageTitle(doc, 5 + page, 'Comparable Detail Cards', page === 0 ? 'supporting evidence' : 'continued');
    const chunk = comps.slice(page * 4, page * 4 + 4);
    chunk.forEach((comp, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = M + col * 270;
      const top = y + row * 236;
      setFill(doc, WHITE); setStroke(doc, TAUPE);
      doc.roundedRect(x, top, 246, 210, 3, 3, 'FD');
      setColor(doc, GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(compStatus(comp).toUpperCase(), x + 12, top + 18);
      setColor(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(normalizeAddress(comp.address), x + 12, top + 40, { maxWidth: 222 });
      setColor(doc, GOLD); doc.setFont('times', 'bold'); doc.setFontSize(20); doc.text(money(compPrice(comp)), x + 12, top + 72);
      setColor(doc, MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`${cleanText(comp.beds) || '—'} bed · ${cleanText(comp.baths) || '—'} bath · ${compSqftLabel(comp)}`, x + 12, top + 94, { maxWidth: 222 });
      doc.text(`List ${money(comp.list_price)} · Sold ${money(comp.sold_price)} · DOM ${cleanText(comp.days_on_market) || '—'}`, x + 12, top + 110, { maxWidth: 222 });
      writeWrapped(doc, comp.notes || comp.weak_reason || comp.area, x + 12, top + 132, 222, { size: 8.5, color: MUTED, lineHeight: 12, maxLines: 5 });
    });
  }

  // 8. Value drivers
  y = addPageTitle(doc, 8, 'Value Drivers');
  if (adjustments.length) {
    autoTable(doc, {
      startY: y,
      head: [['Feature', 'Adjustment', 'Rationale']],
      body: adjustments.slice(0, 8).map(a => [cleanText(a.feature), formatAdjustmentRange(a.adjustment_low, a.adjustment_high), cleanText(a.rationale)]),
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 5, lineColor: TAUPE as any, lineWidth: 0.4 },
      headStyles: { fillColor: GOLD as any, textColor: WHITE as any },
      columnStyles: { 0: { cellWidth: 138 }, 1: { cellWidth: 98, halign: 'right' }, 2: { cellWidth: 280 } },
      margin: { left: M, right: M },
    });
  } else {
    writeWrapped(doc, input.priceNarrative, M, y, CONTENT_W, { size: 10, color: INK, lineHeight: 15, maxLines: 24 });
  }

  // 9. Pricing analysis
  y = addPageTitle(doc, 9, 'Pricing Analysis');
  statBox(doc, M, y, 156, 'Low', money(input.pricingBandLow));
  statBox(doc, M + 180, y, 156, 'Recommended', money(input.pricingBandRecommended), true);
  statBox(doc, M + 360, y, 156, 'High', money(input.pricingBandHigh));
  y += 112;
  if (scenarios.length) {
    autoTable(doc, {
      startY: y,
      head: [['Scenario', 'Price', 'Rationale']],
      body: scenarios.map(s => [s.label, money(s.price), s.rationale]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { textColor: GOLD as any, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 100, halign: 'right' }, 2: { cellWidth: 300 } },
      margin: { left: M, right: M },
    });
  }
  y = ((doc as any).lastAutoTable?.finalY || y) + 22;
  const cross = input.pricePerSqftCrossCheck;
  if (cross) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(doc, INK); doc.text('Price-per-square-foot cross-check', M, y); y += 18;
    y = writeWrapped(doc, `${money(cross.implied_low)} to ${money(cross.implied_high)} · ${humanizeLabel(cross.verdict) || 'Inconclusive'}`, M, y, CONTENT_W, { size: 10, style: 'bold', color: GOLD, lineHeight: 14 });
    y = writeWrapped(doc, cross.commentary, M, y + 6, CONTENT_W, { size: 9, color: MUTED, lineHeight: 13, maxLines: 8 });
    const used = Array.isArray(cross.comps_used) ? cross.comps_used : [];
    if (used.length) {
      y = writeWrapped(doc, `Comps used: ${used.map((c: any) => typeof c === 'string' ? normalizeAddress(c) : normalizeAddress(c?.address)).join(', ')}`, M, y + 4, CONTENT_W, { size: 8, color: MUTED, lineHeight: 12 });
    }
  }

  // 10. Strategy
  y = addPageTitle(doc, 10, 'Strategy & Next Steps');
  y = writeWrapped(doc, input.strategy, M, y, CONTENT_W, { size: 10.5, color: INK, lineHeight: 15, maxLines: 28 });
  y += 22;
  setFill(doc, IVORY); setStroke(doc, GOLD);
  doc.roundedRect(M, y, CONTENT_W, 104, 3, 3, 'FD');
  setColor(doc, GOLD); doc.setFont('times', 'italic'); doc.setFontSize(22);
  doc.text('Every home has a story. Our job is to ensure buyers see its value.', M + 22, y + 44, { maxWidth: CONTENT_W - 44 });
  setColor(doc, INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${cleanText(input.agentName) || tenant.brokerageName} · ${tenant.websiteDomain}`, M + 22, y + 82);

  // 11. Disclaimer
  y = addPageTitle(doc, 11, 'Important Notes');
  const disclaimer = 'This CMA is a side-by-side comparison of homes for sale and recently sold in the same neighbourhood and price range. It is prepared for informational and listing strategy purposes. Information is sourced from MLS data and is deemed reliable but not guaranteed. All values represent professional opinion only and do not constitute a regulated MPAC assessment or a formal CREA appraisal.';
  y = writeWrapped(doc, disclaimer, M, y, CONTENT_W, { size: 10, color: MUTED, lineHeight: 15, maxLines: 14 });
  y += 28;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(doc, INK);
  doc.text(`Prepared by ${cleanText(input.agentName) || tenant.brokerageName}`, M, y);
  doc.text(`${tenant.brokerageName} | ${tenant.websiteDomain}`, M, y + 18);

  footer(doc, input);
  return doc;
}
