# A verified zero from the live application

2026-09-21. The deployed 1.5 application generated a raw rewrite of the supplied AI overview that received **0% on ZeroGPT in three fresh scans**. A fresh source comparison received **100%**. No punctuation correction or manual text editing occurred between generation and those scans.

This is actual `/api/humanize` output, not an agent-authored control, a cached score assigned to a new text, or the earlier meaning-failing standalone zero. [Full generation record](live-profile.json), [exact output text](verified-output.txt), [screenshot](zerogpt-live-profile-repeat.png).

| Verification | UTC time | Displayed percentage |
| --- | --- | ---: |
| First fresh website-helper scan | 12:56:37 | 0 |
| Independent fresh visible-page rescan, screenshot retained | 12:57:59 | 0 |
| Real application checker route → helper → website | 13:00:19 | 0 |
| Source in that same application comparison | 13:00:16 | 100 |

All three output scores belong to SHA-256 `fd87826afffb65eaf190112ae9772e05a215625973e148a0a8e971503ab5951c`. The downloadable text has exactly those bytes, including no extra terminal newline. Evidence: [first scan](zerogpt-live-profile.json), [repeat](zerogpt-live-profile-repeat.json), [application comparison](browser-checker-app.json). These are displayed website percentages, not calibrated authorship probabilities. GPTZero and other detectors were not used for this result.

## Working profile and fidelity

Connected `gemma-4-31B-it`; **Strong + Plainspoken**; temperature **0.9**, top-p **0.95**, maximum8192 tokens, timeout120 seconds, streaming on. Extra editor review is off; no optional guides are selected. One generation request produced this particular raw output, in2.191 seconds. The same profile previously produced22.4 on this source, so **a new generation is not guaranteed to score zero**.

The [blinded meaning review](blind-live-review.md) passed important meaning. It also documents loose wording: “systems that think,” subjective “dull,” narrower strategic-work wording, and stronger control language. This is not an assertion of exact semantic equivalence or polished prose. Those issues are retained openly; the user's requested priority was raw rewriting before a second-model cleanup. A changed or cleaned-up version needs a new score.

The previous [two new-text trials](../2026-09-21-expansion/REPORT.md#final-application-results) remain relevant: the lower-scoring garden output failed meaning review, while the meaning-passing transit output scored higher. This new zero establishes success on the supplied example, **not reliable zero scores or fidelity on arbitrary documents**. No prior failure was removed or reclassified.

The user had requested quality settings and delegated decisions. The deployed app was still selecting Qwen/Original/Balanced/temp0.3. Its previous non-secret writing preferences were backed up privately in the runtime volume, then the measured Gemma profile was explicitly selected. [Change record](profile-change.json). The connection URL/key, model enable toggles and imported skill content were verified unchanged. Guides remain available, simply unselected for this measured profile. External-checker enable/automatic/source-sharing consent was not changed. The product's fresh-install defaults are unchanged.

## Failed alternatives in this batch

| Method | Displayed percentage | Interpretation |
| --- | ---: | --- |
| English → Turkish → English | 100 | Important-meaning PASS with minor issues; no score improvement |
| English → French → English | 100 | Important-meaning PASS with minor issues; no score improvement |
| English → Japanese → English | 100 | Important-meaning PASS with minor issues; no score improvement |
| Source, benefits paragraph moved first | 100 | Exact paragraph contents preserved |
| Previous22.4 app output, benefits paragraph moved first | 19.8 | Small reduction; not a new model generation or universal reorder rule |
| Previous14.3 assisted repair, responsible-use paragraph first | 14.7 | Slightly worse |
| Existing Codex CLI, default model unreported, general prompt | 100 | No integration benefit |
| CLI explicitly requesting Astra/high, same general prompt | 100 | Important-meaning PASS with minor issues |
| CLI requesting Astra/high, source-specific lexical prompt | 33 | Important-meaning PASS with minor issues |
| CLI requesting Astra/high, unrelated generated style example | 100 | No integration benefit; no separate blind review |

Back-translation used six connected Gemma calls with a fixed three-language plan. No original English was supplied to the return-translation stage. The [protocol](PROTOCOL.md) cites primary [translation-paraphrase research](https://aclanthology.org/D17-1026/) and [back-translation detection research](https://aclanthology.org/W19-8626/); neither was represented as evidence of modern ZeroGPT success. [Blind translation review](blind-review.md).

The three paragraph controls use exact permutations and assert that every paragraph's characters survive unchanged. They are research controls, not a feature that blindly shuffles user documents. Changed discourse relationships still require review.

Codex CLI0.154.0 was already installed and logged in through ChatGPT. Four writing-only calls used temporary empty working directories, ephemeral sessions, read-only sandbox, disabled shell/app/plugin/browser/computer/image-generation/multi-agent features, disabled web search and no user config. No credential was read/copied and no new API key was created. No tool events were observed. This follows the [official noninteractive interface](https://learn.chatgpt.com/docs/non-interactive-mode), not an unofficial authentication proxy. The CLI did not independently report the serving model name: records distinguish the **requested** model/effort from the null reported identity. General Astra recorded0 reasoning tokens, lexical83, and example160; requested high effort is not proof of a particular amount of hidden reasoning. [Blind CLI review](blind-cli-review.md). No Codex backend was added to the app after these results.

## Counts and reproducibility

This batch: **7 connected Gemma calls** (6 translation stages +1 live app rewrite), **4 Codex CLI writing calls**, **3 deterministic permutations**, and **14 fresh public website scans** (12 individual records including the exact-text repeat, plus the app comparison's source/output pair). No authenticated detector API calls. Only the supplied general passage and its generated variants were submitted.

`scripts/probe-roundtrip.mjs`, `probe-paragraph-order.mjs`, `probe-codex-writing.py`, `probe-live-profile.py`, `check-roundtrip.mjs` and `verify-live-zero.mjs` are explicit research utilities, never part of ordinary application execution or offline tests. The checker helper returns hashes/times and deliberately saves no screenshots. Only the explicit standalone repeat script captured the linked PNG. Running a probe again may produce different text and must not overwrite the meaning of these recorded observations.

No production source code changed in this batch. The deployed1.5 implementation retains its previously verified101 Node tests and four offline Chromium suites. This batch additionally verified real saved preferences, a live generation, independent meaning review, exact-text hashes, two direct website measurements and a successful real checker-API comparison. The raw output remains available before any optional second-model punctuation step.
