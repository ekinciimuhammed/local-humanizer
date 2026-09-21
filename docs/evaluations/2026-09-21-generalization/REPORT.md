# Four new topics: generalization remains unsolved

2026-09-21. The earlier ZeroGPT zero was one output of one source. To test the user's generalization concern, we froze [four new texts](corpus.json) before generation: remote work, community composting, software caching, and a Turkish library explanation. They were authored as synthetic research inputs; they are not a human-written ground-truth dataset.

Each received one rewrite from the existing Plainspoken recipe and one from a [domain-independent candidate](candidate.txt), using the connected `gemma-4-31B-it` model, Strong, temperature0.9, top-p0.95, max8192 tokens, no guides, no second editor. Eight connected model calls total. Full messages and raw/restored outputs are retained in each generation JSON. This research calls the same message builder and preservation functions, but is not eight `/api/humanize` calls. No candidate was selected by detector feedback; there was no retry/rewrite loop.

The candidate removes the AI-overview-specific abstract-word list and definitions from the existing recipe, and asks for a general claim/qualification-preserving rewrite. It was **not promoted to the production prompt**: these results do not establish a general improvement.

| New source | ZeroGPT source → existing → candidate | Sapling source → existing → candidate | Meaning: existing / candidate |
| --- | --- | --- | --- |
| Remote work | 100 → 96 → 100 | 100 → 99.1 → 99.9 | FAIL / FAIL |
| Community composting | 58.3 → 65 → 57.5 | 100 → 100 → 100 | FAIL / FAIL |
| Software caching | 76.5 → 32.1 → 50.2 | 100 → 99.9 → 100 | FAIL / PASS |
| Turkish library | 100 → 100 → 100 | 100 → 100 → 100 | FAIL / FAIL |

Values are percentages displayed by each website, not calibrated authorship probabilities. The Turkish Sapling run is exploratory; no Turkish detector accuracy was validated. Every measured variant is linked by SHA-256 in its service JSON. No external authenticated API was called. There are24 completed corpus website scans: four sources × three versions × two services. Sapling also automatically scans its own built-in example at page load; these background example requests are not submitted corpus scans or reported measurements.

All eight generations passed the deterministic fact checks. That did **not** mean their meaning was preserved. The independent [blind meaning review](blind-review.md), without detector results or prompts, found one important-meaning PASS among the four candidate outputs and none among the existing outputs. Typical changes were stronger certainty, new operational dependence, changing finished compost into soil, and changing a visit count into a visitor count. The candidate's software text is the sole meaning-passing output; it improved on ZeroGPT but not Sapling.

These are small, deliberately limited measurements, not a statistically representative evaluation. They corroborate the user's concern: a zero on the original example does not transfer reliably across topics or detectors. The current production recipe and generation preferences were left unchanged in this release. The new multi-checker view makes such differences observable; it does not itself improve rewrites.

## Reproduction and evidence

- `scripts/probe-generalization.mjs`: eight calls, frozen corpus/recipes, protected spans and deterministic validation; reads connection credentials in memory from a private runtime-volume copy, never publishes them.
- `scripts/check-generalization.mjs <zerogpt-web|sapling-web>`: one scan per source/output, no automatic retries; explicit external submission, not part of offline tests.
- Each `*-existing.json` / `*-general.json` contains the source, full messages and generated text. Each `*-zerogpt-web.json` / `*-sapling-web.json` contains exact hashes, timestamps and all scores.
- New research files use exclusive writes to avoid silently replacing earlier measurements. These scripts intentionally require an explicit invocation.
