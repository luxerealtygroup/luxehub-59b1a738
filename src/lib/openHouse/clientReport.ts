import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CONDITION_LABEL, Guest, INTEREST_LABEL, PRICE_LABEL,
} from '@/lib/openHouse/guests';
import { tenant } from '@/config/tenant';

/**
 * The seller's copy of an open house recap.
 *
 * Visitors who signed in are third parties: their names, emails and phone
 * numbers never leave our side. This builder only ever emits anonymous
 * feedback ("Visitor 1"), plus the agent's own notes.
 */

export interface ClientOpenHouseReportInput {
  propertyAddress: string;
  openHouseDate: string;
  startsAt: string | null;
  endsAt: string | null;
  guests: Guest[];
  /** The agent's notes for the seller. Empty string leaves the section out. */
  agentNotes: string;
  agentName?: string | null;
}

export function formatReportDate(d: string) {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

export function formatDuration(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt || !endsAt) return '—';
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span = `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const length = h ? `${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''}` : `${m} min`;
  return `${span} (${length})`;
}

/**
 * Belt and braces: even an agent-typed visitor note can't carry an email
 * address or phone number across to the seller.
 */
export function scrubContactDetails(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[removed]')
    .replace(/(?:\+?\d[\s().-]?){9,}\d/g, '[removed]')
    .trim();
}

export interface ClientFeedbackRow {
  label: string;
  interest: string;
  price: string;
  condition: string;
  timeline: string;
  notes: string;
}

export function clientFeedbackRows(guests: Guest[]): ClientFeedbackRow[] {
  return guests
    .map((g, i) => ({
      label: `Visitor ${i + 1}`,
      interest: g.interest_level ? INTEREST_LABEL[g.interest_level] : '—',
      price: g.price_feedback ? PRICE_LABEL[g.price_feedback] : '—',
      condition: g.condition_feedback ? CONDITION_LABEL[g.condition_feedback] : '—',
      timeline: g.timeline ? g.timeline.replace(/_/g, ' ') : '—',
      notes: scrubContactDetails(g.notes) || '—',
    }))
    .filter(r => [r.interest, r.price, r.condition, r.timeline, r.notes].some(v => v !== '—'));
}

export function buildClientOpenHouseReportPdf(input: ClientOpenHouseReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Open House Report', margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(input.propertyAddress, margin, y);
  y += 14;
  doc.setTextColor(120);
  doc.text(formatReportDate(input.openHouseDate), margin, y);
  doc.setTextColor(0);
  y += 22;

  const meta: [string, string][] = [
    ['Date', formatReportDate(input.openHouseDate)],
    ['Hours', formatDuration(input.startsAt, input.endsAt)],
    ['Visitors', String(input.guests.length)],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, margin + 70, y);
    y += 15;
  });
  y += 8;

  const rows = clientFeedbackRows(input.guests);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Visitor feedback', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  if (rows.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [['Visitor', 'Interest', 'Price', 'Condition', 'Timeline', 'Comments']],
      body: rows.map(r => [r.label, r.interest, r.price, r.condition, r.timeline, r.notes]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 5: { cellWidth: 160 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 24;
  } else {
    doc.setTextColor(120);
    doc.text('No visitor feedback was recorded.', margin, y + 18);
    doc.setTextColor(0);
    y += 40;
  }

  const notes = input.agentNotes.trim();
  if (notes) {
    if (y > 660) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Notes from ${input.agentName || 'your agent'}`, margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(notes, 515);
    doc.text(lines, margin, y);
    y += lines.length * 13;
  }

  doc.setTextColor(140);
  doc.setFontSize(9);
  doc.text(
    `${tenant.brokerageName} · Visitor names and contact details are kept private.`,
    margin,
    doc.internal.pageSize.getHeight() - 28,
  );

  return doc;
}
