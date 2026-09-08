/**
 * Parser for pasted "Scripting Boss" call-practice reports.
 * Forgiving about spacing, punctuation and case. The raw text is always kept.
 */

export interface ParsedPracticeReport {
  session_date: string;
  scenario: string;
  mode: string;
  exchanges: number | null;
  earn_30_seconds: number | null;
  motivation_discovery: number | null;
  talk_less_ratio: number | null;
  objection_handling: number | null;
  the_ask: number | null;
  next_step_locked: number | null;
  total: number | null;
  grade: string;
  appointment_set: boolean | null;
  strongest_moment: string;
  costliest_moment: string;
  one_thing_to_change: string;
  drill_again: string;
  coach_note: string;
}

const clean = (s: string) => s.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();

/** "Label: value" or "Label   value" on one line. */
function field(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(`^[\\s*_>#-]*${label}\\s*[:\\-]?\\s*(.+)$`, 'im');
    const m = text.match(re);
    if (m && clean(m[1])) return clean(m[1]);
  }
  return '';
}

/** "The ask   4/5" / "The Ask: 4 / 5" / "The ask - 4" */
function score(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(`^[\\s*_>#-]*${label}[^0-9\\n]*([0-5])\\s*(?:/\\s*5)?\\b`, 'im');
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

function intField(text: string, labels: string[]): number | null {
  const raw = field(text, labels);
  const m = raw.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

export function parsePracticeReport(text: string): ParsedPracticeReport {
  const src = text || '';

  const totalMatch = src.match(/^[\s*_>#-]*total[^0-9\n]*(\d{1,2})\s*(?:\/\s*30)?/im);
  const gradeRaw = field(src, ['grade']);
  const gradeMatch = gradeRaw.match(/[A-Fa-f][+-]?/);

  const apptRaw = field(src, [
    'would this call have produced an appointment\\??',
    'appointment set\\??',
    'appointment\\??',
  ]);
  let appointment_set: boolean | null = null;
  if (/^(yes|y|true)\b/i.test(apptRaw)) appointment_set = true;
  else if (/^(no|n|false)\b/i.test(apptRaw)) appointment_set = false;

  const dateRaw = field(src, ['date', 'session date']);
  const parsedDate = dateRaw ? new Date(dateRaw) : null;
  const session_date =
    parsedDate && !isNaN(parsedDate.getTime())
      ? parsedDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  return {
    session_date,
    scenario: field(src, ['scenario']),
    mode: field(src, ['mode']),
    exchanges: intField(src, ['exchanges', 'number of exchanges']),
    earn_30_seconds: score(src, ['earn(?:ed)?(?: the)?(?: first)? 30 seconds', 'first 30 seconds', 'earn 30']),
    motivation_discovery: score(src, ['motivation discovery', 'motivation']),
    talk_less_ratio: score(src, ['talk[- ]?less ratio', 'talk ratio', 'talk less']),
    objection_handling: score(src, ['objection handling', 'objections']),
    the_ask: score(src, ['the ask', 'ask']),
    next_step_locked: score(src, ['next step locked', 'next step']),
    total: totalMatch ? Number(totalMatch[1]) : null,
    grade: gradeMatch ? gradeMatch[0].toUpperCase() : '',
    appointment_set,
    strongest_moment: field(src, ['strongest moment', 'strongest']),
    costliest_moment: field(src, ['costliest moment', 'costliest']),
    one_thing_to_change: field(src, ['one thing to change', 'one thing']),
    drill_again: field(src, ['drill again', 'drill']),
    coach_note: field(src, ['coach note', "coach's note", 'coaching note']),
  };
}

export const SCORE_FIELDS: { key: keyof ParsedPracticeReport; label: string }[] = [
  { key: 'earn_30_seconds', label: 'Earn the First 30 Seconds' },
  { key: 'motivation_discovery', label: 'Motivation Discovery' },
  { key: 'talk_less_ratio', label: 'Talk Less Ratio' },
  { key: 'objection_handling', label: 'Objection Handling' },
  { key: 'the_ask', label: 'The Ask' },
  { key: 'next_step_locked', label: 'Next Step Locked' },
];
