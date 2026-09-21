# Measured raw rewriting and an optional public website checker

Date: 2026-09-21. Adaptive research on the supplied general AI passage and fictional English texts. **A reliable, meaning-preserving 0% pipeline has not been demonstrated.**

The final integrated Plainspoken recipe produced **22.4%** on the supplied overview, versus a fresh **100%** source score, and passed a blinded review for important meaning. Two previously used examples also decreased, but one lost important meaning. On two newly authored examples, the lower-scoring output failed meaning review and the meaning-passing output scored higher than its source. This is why the recipe remains explicitly experimental and existing settings are preserved.

## Final application results

These are complete outputs from the real `createApp` → `/api/humanize` pipeline, including protected text and local preservation checks. Settings: connected `gemma-4-31B-it`, Strong, Plainspoken, temperature 0.9, top-p 0.95, max tokens 8192, streaming, timeout 120 seconds, no optional guides, no extra editor review. **No punctuation cleanup was applied.**

| Text | Source ZeroGPT % | Raw output % | Important-meaning review | Evaluation status |
| --- | ---: | ---: | --- | --- |
| Supplied AI overview | 100 | 22.4 | PASS, minor wording issues | Reused during adaptive development |
| Fictional library proposal | 69.8 | 32.3 | FAIL: proposal certainty and unsupported attribution | Reused during adaptive development |
| Fictional hybrid-work survey | 47.9 | 39.4 | PASS, minor wording issues | Reused during adaptive development |
| New fictional garden club | 16.3 | 10.8 | FAIL: strengthened objective and weakened evidence limitation | New after recipe was frozen |
| New fictional transit survey | 37.9 | 49 | PASS, minor wording issues | New after recipe was frozen; score worsened |

The three development outputs and exact settings are in [plain-lexical-app.json](plain-lexical-app.json); their score files are `zerogpt-lexapp-*.json`. The two new cases have a [frozen prompt snapshot](heldout-final/prompt-snapshot.mjs), [protocol](heldout-final/protocol.json), [sources](heldout-final/corpus.json), and [complete app results](heldout-final/results.json). Their score files are `zerogpt-final-*.json`. **Neither new case achieved both a lower score and a passing meaning review.** No resampling or cleanup was performed on these cases.

Reviews read only anonymous source/output pairs without detector scores: [development review](blind-lexapp-review.md), [new-case review](heldout-final/blind-review.md). These are independent agent assessments, not human adjudication. PASS allows documented minor issues; it is not a proof of exact semantic equivalence. Mechanical acceptance alone does not establish fidelity.

## What actually reached zero

| Exact candidate | Displayed score | Interpretation |
| --- | ---: | --- |
| Agent-authored initial control | 0 | Unsupported time specificity and loose activity categories; not app output |
| Corrected agent-authored control | 0, repeated 0 | Important-meaning PASS; still not app output or human-authorship ground truth |
| Connected Gemma, source-specific lexical instructions | 0, repeated 0 | Real model generation, but important-meaning FAIL: removes the need for manual work and drops source claims |
| Same Gemma draft, one Qwen repair | 25.6 | Still fails important omissions |
| Same Gemma draft, editor-guided Gemma repair | 14.3 | Important-meaning PASS with minor omissions/awkwardness; assisted research procedure |
| Guided repair, one targeted span edit | 28.2 | Worse than 14.3; not silently substituted as the winner |
| Initial Gemma draft, Qwen reasoning-enabled repair | 18.3 | Still omits an explicit speed claim; not separately blind-reviewed |

The source-specific lexical prompt dictated the opening and four risk questions for this particular overview. Its zero result cannot be assigned to the general product recipe. Exact records: [raw zero candidate](lexical-gemma.json), [its score](zerogpt-lexical-gemma.json), [repeat score](zerogpt-lexical-gemma-repeat.json), [guided repair](lexical-guided-repair.json), and [guided score](zerogpt-lexical-guided-repair.json). The corrected control is explicitly labeled [agent-authored](editor-faithful.json). Repeating an exact text confirms only those observations, not success on new generations or other detectors.

## Other retained experiments

| Procedure | Measured ZeroGPT % | Outcome |
| --- | ---: | --- |
| Existing HIP draft continued to ten fixed passes | 15.3 | Meaning FAIL, including an invented past success claim; not added to product controls |
| Unrelated generated demonstration, Qwen | 94.4 | No useful score improvement |
| Claim-map extraction followed by Gemma composition | 94 | Extraction itself strengthened a condition; not integrated |
| Gemma demonstration draft followed by one HIP pass | 16.7 | Meaning FAIL, including prevalence/oversight drift |
| Source-specific lexical prompt, Qwen | 42 | Meaning FAIL |
| General standalone plain recipe: overview/library/survey | 32.6 / 24.3 / 57.5 | Meaning reviews pass with minor issues; survey worsens versus 47.9 source |
| Earlier integrated recipe with existing guides: overview/survey | 100 / 62.7 | Results differ from the short standalone research prompt |
| Earlier integrated recipe, Strong/no guides: overview | 100 | Removing guides and changing strength alone did not solve copying |
| Source-specific brief then Gemma rewrite: overview | 28.3 | Meaning FAIL; other two outputs lose organization names and were not scanned |
| AuthorMist published local checkpoint | 65.8 | Repetitive summary; insufficient benefit for integration |

Three Qwen reconstruction/reordering candidates, two additional demonstration candidates, a Qwen claim-map composition, two other cross-model HIP candidates, intermediate HIP rounds, and four prefix/base controls were retained without detector scans. They are not claimed as measured detector improvements. Three attempts to use the discovered DeepSeek model returned **HTTP 403**, with no generation; they remain in [plain-deepseek-app.json](plain-deepseek-app.json). No alternative credentials were sought or used.

The first application library attempt was rejected because the name guard treated grammatical `The` as part of `The Northbridge Library`. The rejected preview is preserved in [plain-app.json](plain-app.json). A narrow fix allows removal of that leading article only when a multiword name remains; replacement, omission, duplication, short names such as `The Who`, and explicitly protected full names remain checked. This fix does not approve the library candidate's separate semantic drift.

The old app prompt is retained in [plain-app-recipe-v1.txt](plain-app-recipe-v1.txt). Later prompt changes and selection decisions were recorded adaptively in [PROTOCOL.md](PROTOCOL.md), not presented as a preregistered benchmark.

## Models and primary research

[Method review](../../research/2026-09-21-method-expansion.md) compares the primary HIP, AuthorMist, DIPPER and SICO sources. No upstream detector success rate was treated as our own measurement. No unlicensed repository implementation was copied into the product.

AuthorMist was downloaded to ignored local research data using an allowlist, pinned revision and verified shard hashes: [manifest](authormist-manifest.json). Its upstream Qwen license limits the applicable use; the checkpoint was not bundled or integrated. The first probe incorrectly checked only tokenizer EOS 151645, while the generation configuration accepts both 151645 and 151643. That failed instrumentation record remains in `authormist-eos-check-failed.json`; correcting the completion check and rerunning seed 42 produced exactly the same text. Actual settings include temperature 0.7, top-p 0.9, inherited top-k 20/repetition penalty 1.05 and 512 maximum new tokens. DIPPER's larger runtime requirements were researched but it was not downloaded or run.

The Qwen reasoning repair used one 24576-token-budget request, allowing a complete answer where earlier investigations with smaller budgets exhausted their reasoning allowance. HIP prefix and adapter-disabled base controls invented or omitted content, so they were not promoted on speculative detector claims. Existing native HIP service was restored after the local GPU probes.

## Integrated website checker and workspace

Version 1.5 adds an explicitly selected **ZeroGPT public website (experimental)** provider. It requires the optional local browser helper, no detector API key. The helper submits the exact text once through the visible page in a fresh anonymous Chromium context. It returns only the visible percentage, SHA-256 and timestamp. Challenges, limits, changed input, stale/pre-existing results and errors return **no score**, never an invented zero. There is no automatic retry or target-score loop. The setting and automatic scanning remain off by default.

The actual app route → Compose helper → public website path was exercised with the supplied source and corrected agent control: [integration record](browser-checker-app.json), source 100 and control 0. This validates checker transport, **not an app-generated zero rewrite**. An initial Linux/internal-service addressing failure is retained separately and was fixed before the successful smoke test. Public-page percentages remain distinct from ZeroGPT Business `fakePercentage` and GPTZero class probabilities. No authenticated detector API was tested without credentials.

The workspace presents **Rewrite → Check → Refine**. The raw result is kept before a manual second-model punctuation request. Changing displayed versions invalidates old scores. The punctuation stage cannot fix omissions or changed claims; it is deliberately not the first optimization step. The existing model, connection, credential and skill preferences are not silently replaced by research settings.

## Activity and verification

This expansion contains **35 completed connected-model calls, 3 rejected DeepSeek requests, 12 new HIP generations, 1 adapter-disabled base generation, and 2 AuthorMist generations** (the second corrects EOS instrumentation). Agent-authored controls are separate from those model-call counts. There are **32 recorded public-page scans plus 2 real scans through the integrated checker**, and **0 authenticated detector API calls**. Some candidates were not scanned; a complete output file is not itself a detector measurement. This does not include prior report activity.

All public scan JSON files retain full submitted text, hash, time and visible page result; matching PNGs retain screenshots. Research records intentionally contain only the supplied general passage and fictional texts. Ordinary product operation does not save these research-style histories or screenshots.

Verification on the final 1.5 image: **101/101 Node tests**, plus **four offline Chromium suites** covering the editor, HIP/checker interactions, separate punctuation versions, and fresh-versus-pre-existing public-result parsing. Desktop/mobile screenshots were inspected. Independent scoped product review found no material issues. Compose validation and image build succeeded. Tests use mocks/offline fixtures unless a script is explicitly labeled as a live research check.

The measurements establish progress on some exact raw outputs, including 100 → 22.4 in the real application. They do not establish universal score reduction, a faithful automatic zero, transfer to another checker, or reliable semantic preservation after aggressive rewriting.

Deployment check: local 1.5.0 health returned `ok`, the Compose browser helper returned `ready`, and the app HIP status returned ready on MPS. Production `settings.json` and `credential.key` SHA-256 values were unchanged across the update.
