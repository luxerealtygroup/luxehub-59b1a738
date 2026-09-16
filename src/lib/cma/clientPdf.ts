import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { tenant } from '@/config/tenant';

/**
 * The finished CMA as a standalone document the client can open and keep.
 * Mirrors the approved on-screen report: summary, price band, market picture,
 * strategy and the comparable sales behind it.
 */

export interface CmaPdfComp {
  address: string;
  area?: string;
  beds?: number | null;
  baths?: number | null;
  list_price?: number | null;
  sold_price?: number | null;
  days_on_market?: number | null;
  sale_date?: string | null;
  is_weak?: boolean;
}

export interface CmaPdfInput {
  propertyAddress: string;
  cityArea?: string;
  createdAt: string;
  agentName?: string | null;
  executiveSummary?: string | null;
  priceNarrative?: string | null;
  marketConditions?: string | null;
  strategy?: string | null;
  pricingBandLow?: number | null;
  pricingBandRecommended?: number | null;
  pricingBandHigh?: number | null;
  pricingConfidence?: string | null;
  comps: CmaPdfComp[];
}

const money = (n: number | null | undefined) => (n != null ? `$${Math.round(n).toLocaleString()}` : '—');

export function formatCmaDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

export function buildCmaClientPdf(input: CmaPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 40;
  const width = 515;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); y = margin; }
  };

  const block = (heading: string, body?: string | null) => {
    const text = (body || '').trim();
    if (!text) return;
    ensureRoom(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(heading, margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, width);
    lines.forEach((line: string) => {
      ensureRoom(16);
      doc.text(line, margin, y);
      y += 13;
    });
    y += 12;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Comparative Market Analysis', margin, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(input.propertyAddress, margin, y);
  y += 14;
  doc.setTextColor(120);
  doc.text([input.cityArea, formatCmaDate(input.createdAt)].filter(Boolean).join(' · '), margin, y);
  doc.setTextColor(0);
  y += 26;

  block('Executive summary', input.executiveSummary);

  ensureRoom(90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Recommended pricing', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  ([
    ['Conservative', money(input.pricingBandLow)],
    ['Recommended', money(input.pricingBandRecommended)],
    ['Aggressive', money(input.pricingBandHigh)],
    ['Confidence', input.pricingConfidence || '—'],
  ] as [string, string][]).forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, margin + 95, y);
    y += 14;
  });
  y += 12;

  block('Why this price', input.priceNarrative);
  block('Market conditions', input.marketConditions);
  block('Recommended strategy', input.strategy);

  const comps = input.comps.filter(c => !c.is_weak).slice(0, 10);
  if (comps.length) {
    ensureRoom(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Comparable properties', margin, y);
    autoTable(doc, {
      startY: y + 10,
      head: [['Address', 'Beds', 'Baths', 'Listed', 'Sold', 'Days on market', 'Sale date']],
      body: comps.map(c => [
        c.address,
        c.beds ?? '—',
        c.baths ?? '—',
        money(c.list_price),
        money(c.sold_price),
        c.days_on_market ?? '—',
        c.sale_date || '—',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(140);
    doc.setFontSize(9);
    doc.text(
      `${tenant.brokerageName}${input.agentName ? ` · Prepared by ${input.agentName}` : ''}`,
      margin,
      doc.internal.pageSize.getHeight() - 28,
    );
  }

  return doc;
}
