// Opt-in live evaluation: sends ONLY the checked-in fictional corpus to the
// configured endpoint. Run in a disposable container with the data volume read-only.
// Temporary encrypted settings/key copies stay on container tmpfs and are removed.
import { readFile, writeFile, copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/server.mjs';

const outDir = resolve(process.env.EVALUATION_DIR || 'docs/evaluations/2026-09-21');
const corpus = JSON.parse(await readFile(join(outDir, 'corpus.json'), 'utf8'));
const plan = JSON.parse(await readFile(process.argv[2], 'utf8'));
const temp = await mkdtemp(join(tmpdir(), 'humanizer-eval-'));
let app;
try {
  await copyFile('/source-data/settings.json', join(temp, 'settings.json'));
  await copyFile('/source-data/credential.key', join(temp, 'credential.key'));
  app = await createApp({ dataDir: temp });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const original = await (await fetch(`${base}/api/settings`)).json();
  const records = [];
  await mkdir(outDir, { recursive: true });
  for (const trial of plan.trials) {
    const skillIds = trial.skills || original.skills.enabledIds;
    if (skillIds.some(id => !id.startsWith('builtin:'))) throw new Error('Synthetic evaluation accepts built-in skills only; explicitly select built-in IDs in the plan.');
    const patch = { generation: { ...original.generation, ...trial.generation }, skills: { enabledIds: skillIds }, writing: trial.writing || original.writing || { tone: 'Original', review: false } };
    const saved = await fetch(`${base}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' }, body: JSON.stringify(patch) });
    if (!saved.ok) throw new Error(`Evaluation settings rejected (${saved.status})`);
    for (const id of trial.cases) {
      const sample = corpus.find(item => item.id === id);
      if (!sample) throw new Error(`Unknown synthetic case: ${id}`);
      console.log(`START ${trial.id} / ${id}`);
      const start = performance.now();
      const response = await fetch(`${base}/api/humanize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' }, body: JSON.stringify({ text: sample.text, model: trial.model, strength: trial.strength || 'Balanced' }), signal: AbortSignal.timeout((patch.generation.timeoutSeconds * (patch.writing.review ? 2 : 1) + 10) * 1000) });
      const body = await response.text();
      const events = body.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const done = events.find(e => e.type === 'done');
      const error = events.find(e => e.type === 'error');
      let preview = '';
      for (const event of events) { if (event.type === 'delta') preview += event.text; if (event.type === 'replace') preview = event.text; }
      const record = { trial: trial.id, case: id, model: trial.model, strength: trial.strength || 'Balanced', writing: patch.writing, generation: patch.generation, skills: patch.skills.enabledIds, seconds: Math.round((performance.now() - start) / 100) / 10, accepted: Boolean(done), output: done?.text || null, rejectedPreview: done ? undefined : preview, error: error?.message || (!done ? `HTTP ${response.status}; no completed output` : undefined), writingNotes: done?.writingNotes };
      records.push(record);
      await writeFile(join(outDir, `${plan.name}.json`), JSON.stringify({ created: new Date().toISOString(), syntheticOnly: true, records }, null, 2) + '\n');
      console.log(JSON.stringify({ trial: record.trial, case: id, seconds: record.seconds, accepted: record.accepted, error: record.error }));
    }
  }
} finally {
  if (app) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
  await rm(temp, { recursive: true, force: true });
}
