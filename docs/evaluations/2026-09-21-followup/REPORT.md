# Raw rewrite first, separate second-model cleanup

Date: 2026-09-21. Exploratory development on the user's supplied AI-overview example, not a general detector benchmark.

The lowest newly measured raw score was **45.9% AI** after four fixed HIP passes. That raw text has important meaning errors. One source-grounded repair produced **66.5%**, passing a blinded review for important meaning with minor omissions and awkward grammar remaining. We have not demonstrated a pipeline that reliably combines low detector scores, full fidelity and polished prose.

## Actual measurements

Each new score below is one result displayed by the public [ZeroGPT page](https://www.zerogpt.com/). The adjacent `zerogpt-*.json` files retain the submitted text, SHA-256, timestamp and visible result; matching PNGs retain the page. These are website scores, not measured probabilities of authorship or authenticated API results.

| Exact variant | Displayed AI score | Fidelity / interpretation |
| --- | ---: | --- |
| Original source, earlier investigation | 100% | Reused baseline; not rescanned in this experiment |
| HIP one pass, earlier experiment | 74.8% | Important meaning error; reused output |
| HIP one pass + narrow meaning repair | 52.4% | Important-meaning review passes; minor omissions and surface errors |
| The preceding text + punctuation-only cleanup | 100% | Two hyphens and one capitalization change; different text requires its own score |
| HIP two passes, raw | 49% | Unsupported effort claim and weakened oversight; not a fidelity winner |
| HIP four passes, raw | 45.9% | Automating decisions replaces supporting decisions; effort and oversight drift |
| HIP four passes + meaning/surface repair | 66.5% | Important-meaning review passes; minor omissions, workplace narrowing and awkward efficiency sentence remain |
| Released Gemma humanizer, first raw sample | 100% | Oversight becomes involvement and reliability becomes accuracy; rejected |

The 52.4% → 100% pair is an observation from separate scans, not evidence that punctuation alone has a stable causal effect on the detector. No repeated-scan or randomized control experiment was run. The four-pass cleanup is a **meaning repair research call**, not the product's new punctuation-only button. HIP two-pass meaning repair also failed the semantic review and was not submitted to the checker. Pass three was retained but not scanned.

The original [protocol](PROTOCOL.md) required a score below 50% and no important meaning errors before held-out evaluation. No candidate satisfied both requirements. Later extensions were explicitly recorded after results and after the user's request to prioritize raw rewriting. [Two held-out cases](heldout.json) were prepared but **not run**. These adaptive, single-example observations do not establish an unseen-text success rate or a best model.

## Method and retained failures

- HIP uses the existing pinned Qwen3-4B-Base adapter and native MPS worker. The first pass was reused from the [previous pilot](../2026-09-21-hip/REPORT.md); new rounds used seeds 43, 44 and 45, temperature 1 and top-p 0.95. Each round takes the preceding draft. There is no score-driven automatic retry loop.
- Repair used the existing connected Qwen3.5-122B-A10B with source and draft, exact-substring JSON patches, temperature 0.2 and no detector feedback. An initial 4096-token call ended without a complete answer; its exact finish reason was not retained. Two retained 8192-token failures exhausted their budget in reasoning with empty visible content. The documented [Qwen non-thinking switch](https://huggingface.co/Qwen/Qwen3.5-122B-A10B#instruct-or-non-thinking-mode) produced usable replies. All retained failures remain alongside successful candidates. Equivalent top-level edit arrays were accepted without another call.
- Punctuation cleanup used temperature 0 and one call. The actual new `/api/punctuation` route was also exercised against the connected model in an isolated app with copied settings on tmpfs and the production volume mounted read-only. Its output exactly matched the separately measured punctuation candidate: [integration record](punctuation-app.json). This extra call did not require another identical-text detector scan.
- New Gemma candidate: [jialinyyzz/humanizer-gemma-4-e4b](https://huggingface.co/jialinyyzz/humanizer-gemma-4-e4b/tree/93d4eee64b92e8b4ef331540fe1aadac0724dc00), revision `93d4eee64b92e8b4ef331540fe1aadac0724dc00`, Q6_K GGUF, 6,172,061,472 bytes. Hashes are in [model-manifest.json](model-manifest.json). Used Ollama 0.33.0, Metal, exact published raw prompt, temperature 0.85, top-p 0.95, seed 42 and 900 maximum output tokens. The published anti-copy guard was omitted; the observed five-gram copy ratio, 0.069, was below its 0.35 trigger. The upstream detector claim is not our result. The model was **not integrated** after this failed probe. [Upstream source](https://github.com/sgaofen/humanizer/tree/65799b5c89e2c4096423eb9267cf7a8061ae9796) is Apache-2.0; weights have separate Gemma terms. Downloaded weights stay in ignored local data.
- Blinded editorial reviews read source/candidate pairs without scores: [repair review](blind-review-repair.md), [Gemma review](blind-review-gemma.md), [final review](blind-review-final.md). These are independent agent reviews, not human adjudication. Mechanical fact checks do not establish semantic equivalence.

New live activity in this follow-up: **3 HIP generations, 1 Gemma generation, 8 connected-Qwen calls (including 3 incomplete attempts and the app integration check), 6 public ZeroGPT scans, 0 authenticated detector API calls**. Only the supplied general passage and synthetic text were used. Existing connection settings, credentials, selected model and skills were preserved.

## Integrated behavior in 1.4.0

HIP now offers **1, 2 or 4 fixed passes**. Four is marked experimental and slower. The app retains the raw completed output. The user can then select an enabled connected model and request one punctuation suggestion. The suggestion is saved separately; raw remains selected until the user switches versions. Switching versions invalidates checker results so scores cannot silently follow a different text.

The punctuation route accepts up to 6,000 characters of plain prose and at most eight small, unique, non-overlapping patches. It rejects word additions, removals or substitutions, protected content, unsafe patches and incomplete responses. It permits punctuation, hyphenation and capitalization changes. Cancellation/error preserves the original. It does not repair semantic drift, and punctuation itself can still affect meaning. No automatic second-model loop was added. Connected Qwen remains the existing default; HIP and external checking remain explicit choices.

## Reproduction and limits

The retained JSON is the authoritative record of these runs; new stochastic inference or website rescans may differ. Existing `scripts/hip_worker.py` serves the HIP engine. `scripts/setup-gemma-probe.py` downloads the pinned research model using the HIP virtual environment; `scripts/probe-gemma.mjs` sends the exact raw prompt to the isolated local Ollama endpoint.

`scripts/probe-semantic-repair.mjs`, `scripts/probe-four-repair.mjs` and `scripts/probe-grammar-cleanup.mjs` replay the recorded drafts against the configured provider. They expect a read-only production data mount at `/source-data`, copy only the needed configuration into a temporary directory, and remove that copy afterward. Running them makes real model requests and overwrites the matching research record; use a separate checkout/output copy when reproducing. The scripts do not publish provider credentials.

`scripts/check-followup-detector.mjs <record-id>` submits one explicitly selected research record through the public site's visible UI and saves its result. It needs Playwright and Chromium paths via `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`. It is an opt-in research script, not a background product scraper. There was no CAPTCHA bypass and no verification of the separately configured official detector APIs without their credentials.

Software checks and browser fixtures establish implementation behavior only. They do not establish detector performance. Remaining work for a stronger quality claim would require a frozen method, unseen texts, repeated controls and separately measured final outputs; this report makes no such claim.

## Delivery verification

The final 1.4.0 Docker image passed **83/83 Node tests with external networking disabled**. All three offline Chromium suites passed: existing app flows, HIP/checker flows and the new punctuation/version/cancellation flow. Desktop and mobile punctuation screenshots were visually inspected; browser screenshots use fixtures. Independent code review's custom-protected-term finding was fixed and cleared in a scoped rereview. The actual connected-model route check above is separate from these fixtures.

Docker Compose deployed 1.4.0 healthy at `http://localhost:3002`. Read-only checks confirmed the MPS HIP worker ready, the existing connected Qwen default intact, and identical pre/post deployment hashes for `settings.json` and `credential.key`. The temporary Gemma/Ollama research server was stopped. No model weights or credentials are included in the public repository.
