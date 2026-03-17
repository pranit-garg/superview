import type { ContentType } from '../types.js';

export function detectContentType(content: string): ContentType {
  const trimmed = content.trim();
  const lines = trimmed.split('\n');
  const firstFiveLines = lines.slice(0, 5).join('\n');
  const charCount = trimmed.length;

  // 1. Email: has "To:" or "From:" or "Subject:" in first 5 lines
  if (/^(To|From|Subject):\s/m.test(firstFiveLines)) {
    return 'email';
  }

  // 2. Code: starts with ```, has code keywords, or high density of code chars
  if (trimmed.startsWith('```')) {
    return 'code';
  }
  const codeChars = (trimmed.match(/[{};=()]/g) || []).length;
  const codeDensity = charCount > 0 ? codeChars / charCount : 0;
  const hasCodeKeywords = /\b(function|const|let|var|return|import|export|class|if|else|for|while|def|fn|pub|async|await)\b/.test(trimmed);
  if (codeDensity > 0.04 && hasCodeKeywords) {
    return 'code';
  }
  if (codeDensity > 0.08) {
    return 'code';
  }

  // 3. Table: has pipe-delimited lines or starts with [ and is JSON array
  const pipeLines = lines.filter(l => l.includes('|') && l.trim().startsWith('|'));
  if (pipeLines.length >= 2) {
    return 'table';
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return 'table';
    } catch {
      // Not valid JSON, continue
    }
  }

  // 4. Tweet vs Message: short single-paragraph text
  const paragraphs = trimmed.split(/\n\n+/).filter(p => p.trim());
  const hasHeaders = /^#{1,3}\s+/m.test(trimmed);
  const isConversational = /^(hey|hi|hello|yo|sup|thanks|ok|sure|sounds|yeah|no|sorry|please|can you|could you|are you|do you|would you|let me|i'll|i'm)\b/i.test(trimmed);
  const isQuestion = trimmed.endsWith('?');

  // Message: short, conversational tone or direct question to a person
  if (charCount < 200 && paragraphs.length <= 1 && (isConversational || (isQuestion && charCount < 100))) {
    return 'message';
  }

  // Tweet: <= 280 chars, single paragraph, no headers, not conversational
  if (charCount <= 280 && paragraphs.length <= 1 && !hasHeaders) {
    return 'tweet';
  }

  // 5. Thread: multiple sections separated by --- or numbered (1/, 2/)
  const hasSeparators = /\n---\n/.test(trimmed);
  const hasNumberedSections = /^[0-9]+[/.]\s/m.test(trimmed);
  if (hasSeparators || (hasNumberedSections && paragraphs.length >= 2)) {
    return 'thread';
  }

  // 6. LinkedIn: preserved line breaks, > 500 chars, no code
  const lineBreakDensity = lines.length / charCount;
  if (charCount > 500 && !hasHeaders && codeDensity < 0.02 && lineBreakDensity > 0.005) {
    return 'linkedin';
  }

  // 7. Message fallback: any remaining short content
  if (charCount < 150 && paragraphs.length <= 1 && !hasHeaders) {
    return 'message';
  }

  // 8. Document: has # headers, > 1000 chars, multiple sections
  if (hasHeaders && charCount > 1000 && paragraphs.length >= 3) {
    return 'document';
  }

  // If it has headers but is shorter, still treat as document
  if (hasHeaders && paragraphs.length >= 2) {
    return 'document';
  }

  // 9. Generic: default fallback
  return 'generic';
}
