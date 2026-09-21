import { randomBytes } from 'node:crypto';

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockPatterns = [
  '`+[^`\\n]+`+',
  '^ {4}[^\\n]*(?:\\n(?: {4}[^\\n]*|[ \\t]*))*',
  '!?(?:\\[[^\\]\\n]*\\])\\((?:[^()\\n]|\\([^()\\n]*\\))*\\)',
  '^ {0,3}\\[[^\\]\\n]+\\]:[^\\n]+',
  '\\[[^\\]\\n]+\\]\\[[^\\]\\n]*\\]',
  'https?://[^\\s<>"\\]`]+',
  '[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}',
  '"[^"]+"|“[^”]+”|«[^»]+»|‘[^’]+’',
  "(?<![\\p{L}\\p{N}])'[^'\\n]+'(?![\\p{L}\\p{N}])",
  '\\[(?:\\d+[a-z]?(?:[-–,; ]+\\d+[a-z]?)*)\\]|\\[\\^[^\\]]+\\]',
  '\\([^()\\n]*(?:et al\\.|[\\p{Lu}][\\p{L}-]+,?)[^()\\n]*\\b(?:19|20)\\d{2}[a-z]?[^()\\n]*\\)',
];

export function protectText(source, terms = []) {
  const prefix = `__KEEP_${randomBytes(5).toString('hex')}_`;
  const values = [];
  const patterns = [...blockPatterns, ...terms.filter(Boolean).sort((a, b) => b.length - a.length).map(escape)];
  const ranges = [];
  let fence = null; let position = 0;
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence && marker) fence = { marker: marker[1], start: position };
    else if (fence && new RegExp(`^ {0,3}${escape(fence.marker[0])}{${fence.marker.length},}\\s*$`).test(line)) {
      ranges.push({ start: fence.start, end: position + line.replace(/\n$/, '').length }); fence = null;
    }
    position += line.length;
  }
  if (fence) ranges.push({ start: fence.start, end: source.length });
  for (const match of source.matchAll(new RegExp(patterns.join('|'), 'gmu'))) {
    const start = match.index; const end = start + match[0].length;
    if (!ranges.some(range => start < range.end && end > range.start)) ranges.push({ start, end });
  }
  ranges.sort((a, b) => a.start - b.start);
  let text = ''; let cursor = 0;
  for (const { start, end } of ranges) {
    const token = `${prefix}${values.length}__`;
    const value = source.slice(start, end);
    const terminalQuote = /^["“‘«']/.test(value) && /[.!?]["”’»']$/.test(value);
    values.push({ token, value, removeAddedFullStop: terminalQuote && source[end] !== '.' });
    text += source.slice(cursor, start) + token; cursor = end;
  }
  text += source.slice(cursor);
  return {
    text, tokens: values.map(v => v.token), spans: ranges,
    preview(result) {
      let preview = result;
      for (const { token, value } of values) preview = preview.replaceAll(token, () => value);
      const pending = preview.indexOf(prefix);
      if (pending !== -1) preview = preview.slice(0, pending);
      for (let n = Math.min(prefix.length, preview.length); n > 0; n--) {
        if (prefix.startsWith(preview.slice(-n))) return preview.slice(0, -n);
      }
      return preview;
    },
    restore(result) {
      for (const { token } of values) {
        if (result.split(token).length !== 2) throw new Error('Protected content was changed or duplicated. The result was discarded; try Light strength or another model.');
      }
      let restored = result;
      for (const { token, value, removeAddedFullStop } of values) {
        // The model cannot see punctuation inside immutable quotations. Remove
        // only a redundant period it appended; retain source punctuation,
        // ellipses, unpunctuated quotes and code exactly as supplied.
        if (removeAddedFullStop) restored = restored.replace(new RegExp(`${escape(token)}\\.(?=\\s|$)`, 'u'), () => token);
        restored = restored.replace(token, () => value);
      }
      if (restored.includes(prefix)) throw new Error('Unexpected protected-content marker. The result was discarded.');
      return restored;
    },
  };
}

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}
const monthNames = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık';
const datePattern = new RegExp(`(?<![\\p{L}])(?:(?:${monthNames})[ \\t]+\\d{1,2}(?:st|nd|rd|th)?(?:,?[ \\t]+\\d{4})?|\\d{1,2}[ \\t]+(?:${monthNames})(?:[ \\t]+\\d{4})?)(?![\\p{L}])`, 'giu');
function numberFacts(text) {
  return (text.match(/(?<![\p{L}\p{N}_])[-+−]?(?:[\p{Sc}%‰]\s*)?\d+(?:[.,:/-]\d+)*(?:[ \t]*(?:[%‰\p{Sc}]|USD|EUR|GBP|TRY|TL|JPY|CNY|CHF|CAD|AUD)(?![\p{L}]))?/gu) || []).map(v => v.trim());
}
function nameFacts(text) {
  const names = text.match(/(?<![\p{L}\p{N}_])\p{Lu}[\p{Ll}]+(?:[ \t]+\p{Lu}[\p{L}.-]+){1,4}/gu) || [];
  // A sentence-leading article is not part of the candidate's core name.
  // Keep at least two name words, so short names such as "The Who" stay exact.
  return names.map(name => name.replace(/^The[ \t]+(?=\S+[ \t]+\S)/u, ''));
}
function identifiers(text) {
  return text.match(/\b[A-Z]{2,}[A-Z\d]*\b|\b[a-zA-Z]\w*[_]\w+\b|\b[a-z]+(?:[A-Z][a-z\d]+)+\b|\b\w+(?:::\w+)+\b/g) || [];
}
function markdownStructure(text) {
  return (text.match(/^ {0,3}(?:#{1,6}(?=\s)|>(?=\s)|[-*+](?=\s)|\d+[.)](?=\s)|\|)/gm) || []).map(v => v.trim().replace(/\d+/, 'N'));
}
export function validateFacts(source, result, terms = []) {
  const issues = [];
  const compare = (kind, before, after, allowNew = false) => {
    const a = counts(before); const b = counts(after);
    for (const [value, count] of a) if (b.get(value) !== count) issues.push(`${kind} changed: ${value}`);
    if (!allowNew) for (const value of b.keys()) if (!a.has(value)) issues.push(`${kind} added: ${value}`);
  };
  compare('Number / date', numberFacts(source), numberFacts(result));
  compare('Written date', source.match(datePattern) || [], result.match(datePattern) || []);
  compare('URL', source.match(/https?:\/\/[^\s<>"\]`]+/gu) || [], result.match(/https?:\/\/[^\s<>"\]`]+/gu) || []);
  compare('Email', source.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/gu) || [], result.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/gu) || []);
  // Discover candidate names in the source, then count their literal occurrences.
  // Re-extracting result entities can absorb an adjacent capitalized article
  // (Northstar Labs -> The Northstar Labs) and incorrectly report a changed name.
  // This remains a conservative heuristic, not a semantic entity recognizer.
  for (const name of new Set(nameFacts(source))) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(name)}(?![\\p{L}\\p{N}_])`, 'gu');
    if ([...source.matchAll(pattern)].length !== [...result.matchAll(pattern)].length) issues.push(`Name / organization changed: ${name}`);
  }
  // Prose acronyms can recur a different number of times after restructuring.
  // Preserve their identities; exact code/quote occurrences are separately locked
  // by placeholders. Non-acronym identifiers still require literal counts.
  const beforeIds = identifiers(source); const afterIds = identifiers(result);
  const acronym = id => /^[A-Z]{2,}$/.test(id);
  compare('Technical acronym', [...new Set(beforeIds.filter(acronym))], [...new Set(afterIds.filter(acronym))]);
  compare('Technical identifier', beforeIds.filter(id => !acronym(id)), afterIds.filter(id => !acronym(id)));
  for (const term of terms) if (term && source.split(term).length !== result.split(term).length) issues.push(`Protected term changed: ${term}`);
  compare('Markdown structure', markdownStructure(source), markdownStructure(result));
  return issues;
}

export function splitText(source, limit = 6000) {
  // Split on blank lines outside immutable spans. Keep paragraph separators verbatim.
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) || [];
  const blocks = [];
  let block = ''; let separator = ''; let position = 0; let spanIndex = 0;
  const spans = protectText(source).spans;
  const flush = () => { if (block || separator) blocks.push({ text: block, separator }); block = ''; separator = ''; };
  for (const line of lines) {
    while (spans[spanIndex]?.end <= position) spanIndex++;
    const inProtectedSpan = spans[spanIndex] && spans[spanIndex].start <= position && position < spans[spanIndex].end;
    position += line.length;
    if (!inProtectedSpan && /^\s*\n$/.test(line)) {
      if (!separator && block.endsWith('\n')) { block = block.slice(0, -1); separator = '\n'; }
      separator += line;
    } else {
      if (separator) flush();
      block += line;
    }
  }
  flush();
  const chunks = [];
  for (const part of blocks) {
    if (part.text.length > limit) throw new Error(`A paragraph or code block exceeds the ${limit.toLocaleString('en-US')}-character chunk limit. Add paragraph breaks or increase Chunk size in Settings.`);
    const last = chunks.at(-1);
    if (last && (last.text + last.separator + part.text).length <= limit) {
      last.text += last.separator + part.text; last.separator = part.separator;
    } else chunks.push({ ...part });
  }
  return chunks;
}
