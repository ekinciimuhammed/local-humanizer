const $ = id => document.getElementById(id);
export function clearWritingNotes() { $('writing-notes').hidden = true; $('writing-notes').open = false; }
export function showWritingNotes(notes, skills = []) {
  if (!notes) return;
  const tbody = $('writing-notes-rows'); tbody.replaceChildren();
  for (const signal of notes.before.signals) {
    const after = notes.after.signals.find(s => s.id === signal.id);
    const row = document.createElement('tr'); const label = document.createElement('th'); label.scope = 'row'; label.textContent = signal.label; label.title = signal.suggestion;
    const beforeCell = document.createElement('td'); beforeCell.textContent = signal.count;
    const afterCell = document.createElement('td'); afterCell.textContent = after?.count ?? 0;
    row.append(label, beforeCell, afterCell); tbody.append(row);
  }
  const rhythm = stats => stats.sentences ? `${stats.sentenceLength.min}–${stats.sentenceLength.max} words per sentence (average ${stats.sentenceLength.average})` : 'No unprotected prose sentences';
  $('writing-rhythm').textContent = `Original: ${rhythm(notes.before)}. Result: ${rhythm(notes.after)}.`;
  $('writing-skills-used').textContent = skills.length ? `Skills used: ${skills.map(skill => skill.title).join(', ')}.` : 'Core editor only; no optional skills were enabled.';
  $('writing-notes').hidden = false;
}
