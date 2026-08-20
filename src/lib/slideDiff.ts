/**
 * Lightweight word-level diff based on the classic LCS algorithm.
 * No external dependency. Splits text on whitespace while preserving
 * trailing whitespace so the rendered diff reads naturally.
 */

export type DiffOp = 'equal' | 'added' | 'removed';

export interface DiffToken {
  op: DiffOp;
  value: string;
}

function tokenize(text: string): string[] {
  // Split on word boundaries but keep runs of whitespace attached to the
  // following word so reconstruction stays readable.
  if (!text) return [];
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Compute LCS-based diff between two strings, returned as ordered tokens. */
export function diffWords(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of LCS of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ op: 'equal', value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ op: 'removed', value: a[i] });
      i++;
    } else {
      tokens.push({ op: 'added', value: b[j] });
      j++;
    }
  }
  while (i < n) tokens.push({ op: 'removed', value: a[i++] });
  while (j < m) tokens.push({ op: 'added', value: b[j++] });

  return tokens;
}

/** Merge adjacent tokens with the same op for cleaner rendering. */
export function coalesceTokens(tokens: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.op === t.op) {
      last.value += t.value;
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(tokens: DiffToken[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const t of tokens) {
    if (t.op === 'added') added++;
    else if (t.op === 'removed') removed++;
  }
  return { added, removed };
}
