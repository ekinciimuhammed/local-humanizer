import { protectText } from './preservation.mjs';

const patterns = [
  { id: 'ceremonial', label: 'Ceremonial phrasing', phrases: ['it is important to note that', 'it is worth noting that', 'it is worth mentioning that', 'önemle belirtmek gerekir ki', 'belirtmekte fayda var'], suggestion: 'Check whether the phrase adds meaning or delays the point.' },
  { id: 'transitions', label: 'Stock transitions', phrases: ['furthermore', 'moreover', 'in conclusion', 'in addition to the above', 'bu bağlamda', 'sonuç olarak', 'özetlemek gerekirse'], suggestion: 'Keep transitions that express a real relationship; trim redundant ones.' },
  { id: 'inflation', label: 'Inflated wording', phrases: ['stands as a testament', 'a pivotal moment', 'in today’s fast-paced world', "in today's fast-paced world", 'plays a pivotal role', 'günümüzün hızla değişen dünyasında', 'çığır açan bir', 'benzersiz bir deneyim'], suggestion: 'Use the supported fact rather than an unearned claim of significance.' },
  { id: 'wrappers', label: 'Assistant-style wrappers', phrases: ['i hope this helps', 'here is the rewritten text', 'here is the humanized version', 'umarım yardımcı olmuştur', 'işte düzenlenmiş metin'], suggestion: 'Remove assistant commentary that is not part of the document.' },
];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = value => value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
function proseOnly(text, terms) {
  const spans = protectText(text, terms).spans;
  let cursor = 0; let prose = '';
  for (const span of spans) { prose += text.slice(cursor, span.start) + text.slice(span.start, span.end).replace(/[^\n]/g, ' '); cursor = span.end; }
  return prose + text.slice(cursor);
}
export function analyzeWriting(text, protectedTerms = []) {
  const prose = proseOnly(text, protectedTerms);
  const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(prose)].map(s => words(s.segment)).filter(s => s.length);
  const lengths = sentences.map(s => s.length);
  const signals = patterns.map(pattern => ({
    id: pattern.id, label: pattern.label, suggestion: pattern.suggestion,
    count: [...prose.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern.phrases.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'giu'))].length,
  }));
  let repetitions = 0; let run = 1;
  for (let i = 1; i < sentences.length; i++) {
    const prior = sentences[i - 1].slice(0, 2).join(' ').toLowerCase(); const next = sentences[i].slice(0, 2).join(' ').toLowerCase();
    run = prior === next ? run + 1 : 1;
    if (run >= 3) repetitions++;
  }
  signals.push({ id: 'openings', label: 'Repeated sentence openings', count: repetitions, suggestion: 'Three adjacent sentences begin alike. Keep deliberate repetition; vary mechanical repetition.' });
  const total = words(prose).length;
  return {
    words: total, sentences: sentences.length, paragraphs: prose.split(/\n\s*\n/).filter(s => s.trim()).length,
    sentenceLength: { min: lengths.length ? Math.min(...lengths) : 0, max: lengths.length ? Math.max(...lengths) : 0, average: lengths.length ? Math.round(total / lengths.length * 10) / 10 : 0 },
    signals,
  };
}
export function compareWriting(before, after, protectedTerms = []) {
  return { before: analyzeWriting(before, protectedTerms), after: analyzeWriting(after, protectedTerms) };
}
