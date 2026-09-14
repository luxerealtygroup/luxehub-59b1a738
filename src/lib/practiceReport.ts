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
  structure_covered: string;
  magic_words_used: string;
  magic_words_missed: string;
  one_thing_to_change: string;
  drill_again: string;
  coach_note: string;
}

const clean = (s: string) => s.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();

/** Spelled-out numbers, so dictated reports ("four out of five") parse too. */
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
};
const WORD_ALT = Object.keys(WORD_NUMBERS).join('|');
const NUM = `(\\d{1,3}|(?:twenty|thirty)[-\\s](?:${WORD_ALT})|${WORD_ALT})`;

function toNumber(raw: string): number | null {
  const s = raw.toLowerCase().trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(/[-\s]+/);
  let total = 0;
  for (const p of parts) {
    if (!(p in WORD_NUMBERS)) return null;
    total += WORD_NUMBERS[p];
  }
  return total;
}

/** Label at the start of a line OR mid-paragraph after sentence punctuation. */
function labelRegex(label: string, tail: string, flags = 'im') {
  return new RegExp(`(?:^|[.;!?\\n—-]\\s*)[\\s*_>#-]*${label}[^:\\n]{0,40}?\\s*[:\\-—]?\\s*${tail}`, flags);
}

/** Every label we know about, so a captured value stops before the next one. */
const STOP_LABELS = [
  'scenario', 'mode', 'exchanges', 'earn(?:ed)?(?: the)?(?: first)?\\s*(?:30|thirty)',
  'motivation discovery', 'talk[- ]?less ratio', 'objection handling', 'the ask',
  'next step locked', 'total', 'grade', 'strongest moment', 'costliest moment',
  'structure covered', 'magic words used', 'magic words missed',
  'one thing to change', 'drill (?:this )?again', "coach'?s? note", 'would this call',
];
const STOP_RE = new RegExp(`\\s*\\b(?:${STOP_LABELS.join('|')})\\b[^:\\n]{0,40}?\\s*[:\\-—]\\s`, 'i');

function trimAtNextLabel(value: string): string {
  const m = value.match(STOP_RE);
  return (m && m.index !== undefined ? value.slice(0, m.index) : value).replace(/[\s.,;:—-]+$/, '').trim();
}

/** "Label: value" — captures up to the end of the line or the next known label. */
function field(text: string, labels: string[]): string {
  // Prefer a real separator so trailing label words ("note to Kristen:") aren't kept.
  for (const tail of ['[^:\\n]{0,40}?\\s*[:\\-—]\\s*(.+)$', '\\s+(.+)$']) {
    for (const label of labels) {
      const m = text.match(
        new RegExp(`(?:^|[.;!?\\n—]\\s*)[\\s*_>#-]*${label}${tail}`, 'im'),
      );
      if (m) {
        const value = trimAtNextLabel(clean(m[1]));
        if (value) return value;
      }
    }
  }
  return '';
}


/** "The ask 4/5" / "The Ask: 4 / 5" / "The ask: four out of five" */
function score(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const m =
      text.match(labelRegex(label, `${NUM}\\s*(?:/|out of)\\s*(?:5|five)\\b`)) ||
      text.match(labelRegex(label, `${NUM}\\b`));
    if (m) {
      const n = toNumber(m[1]);
      if (n !== null && n >= 0 && n <= 5) return n;
    }
  }
  return null;
}

function intField(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const m = text.match(labelRegex(label, `(?:about\\s+|roughly\\s+|~)?${NUM}\\b`));
    if (m) {
      const n = toNumber(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}


/** Handles lines like "A L P T M A M A structure: Appointment and Location were covered..." */
function structureLine(text: string): string {
  const line = text.split('\n').find((l) => /structure/i.test(l));
  return line ? clean(line) : '';
}

export function parsePracticeReport(text: string): ParsedPracticeReport {
  const src = text || '';

  const totalMatch =
    src.match(labelRegex('total', `${NUM}\\s*(?:/|out of)\\s*(?:30|thirty)\\b`)) ||
    src.match(labelRegex('total', `${NUM}\\b`));
  const total = totalMatch ? toNumber(totalMatch[1]) : null;

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
    earn_30_seconds: score(src, ['earn(?:ed)?(?: the)?(?: first)?\\s*(?:30|thirty)(?: seconds)?', 'first 30 seconds']),
    motivation_discovery: score(src, ['motivation discovery', 'motivation', 'timeline']),
    talk_less_ratio: score(src, ['talk[- ]?less ratio', 'talk ratio', 'talk less']),
    objection_handling: score(src, ['objection handling', 'objections']),
    the_ask: score(src, ['the ask', 'ask']),
    next_step_locked: score(src, ['next step locked', 'next step']),
    total,
    grade: gradeMatch ? gradeMatch[0].toUpperCase() : '',
    appointment_set,
    strongest_moment: field(src, ['strongest moment', 'strongest']),
    costliest_moment: field(src, ['costliest moment', 'costliest']),
    structure_covered: field(src, ['structure covered', 'structure']) || structureLine(src),

    magic_words_used: field(src, ['magic words used']),
    magic_words_missed: field(src, ['magic words missed']),
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
