import type { DiffSegment } from '../types.js';

export function computeDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = tokenize(oldText);
  const newWords = tokenize(newText);
  const lcs = longestCommonSubsequence(oldWords, newWords);

  const segments: DiffSegment[] = [];
  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldWords.length || ni < newWords.length) {
    if (li < lcs.length && oi < oldWords.length && ni < newWords.length && oldWords[oi] === lcs[li] && newWords[ni] === lcs[li]) {
      segments.push({ type: 'equal', text: lcs[li] });
      oi++;
      ni++;
      li++;
    } else {
      if (oi < oldWords.length && (li >= lcs.length || oldWords[oi] !== lcs[li])) {
        segments.push({ type: 'remove', text: oldWords[oi] });
        oi++;
      }
      if (ni < newWords.length && (li >= lcs.length || newWords[ni] !== lcs[li])) {
        segments.push({ type: 'add', text: newWords[ni] });
        ni++;
      }
    }
  }

  return mergeSegments(segments);
}

export function renderDiffHtml(segments: DiffSegment[]): string {
  return segments.map(seg => {
    switch (seg.type) {
      case 'add':
        return `<span class="sv-diff-add">${escapeHtml(seg.text)}</span>`;
      case 'remove':
        return `<span class="sv-diff-remove">${escapeHtml(seg.text)}</span>`;
      case 'equal':
        return escapeHtml(seg.text);
    }
  }).join('');
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // Use space-optimized LCS for large inputs
  if (m * n > 1_000_000) {
    return hirschbergLCS(a, b);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

function hirschbergLCS(a: string[], b: string[]): string[] {
  if (a.length === 0) return [];
  if (b.length === 0) return [];
  if (a.length === 1) {
    return b.includes(a[0]) ? [a[0]] : [];
  }

  const mid = Math.floor(a.length / 2);
  const top = a.slice(0, mid);
  const bottom = a.slice(mid);

  const rowTop = lcsLengths(top, b);
  const rowBottom = lcsLengths(bottom.slice().reverse(), b.slice().reverse()).reverse();

  let maxSum = -1;
  let splitJ = 0;
  for (let j = 0; j <= b.length; j++) {
    const sum = (rowTop[j] || 0) + (rowBottom[j] || 0);
    if (sum > maxSum) {
      maxSum = sum;
      splitJ = j;
    }
  }

  return [
    ...hirschbergLCS(top, b.slice(0, splitJ)),
    ...hirschbergLCS(bottom, b.slice(splitJ)),
  ];
}

function lcsLengths(a: string[], b: string[]): number[] {
  let prev = new Array(b.length + 1).fill(0);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev;
}

function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return [];

  const merged: DiffSegment[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (last.type === segments[i].type) {
      last.text += segments[i].text;
    } else {
      merged.push({ ...segments[i] });
    }
  }
  return merged;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
