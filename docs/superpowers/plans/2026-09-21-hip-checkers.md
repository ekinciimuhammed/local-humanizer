# HIP and external checker implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent checker component; root implements model validation and integration. User explicitly authorized verification and integration after reading the research decision.

**Goal:** Provide a locally served experimental HIP engine and opt-in real external detector results without changing the existing provider connection.
**Architecture:** A separate native Python worker loads pinned HIP weights; Node calls it through a bounded local HTTP interface. Detectors use dedicated encrypted credentials and explicit opt-in, with UI results bound to a document snapshot.
**Tech Stack:** Existing dependency-free Node application; optional Python PyTorch/Transformers/PEFT worker outside Docker for Apple MPS; official GPTZero and ZeroGPT endpoints.
**Spec:** `docs/research/2026-09-21-method-decision.md`.

## Constraints and review focus
- Preserve existing provider credentials, models, generation preferences and skills. New engine remains experimental and optional unless the predeclared quality gate passes.
- No silent truncation, fabricated scores, infinite retry, or checker-triggered rewrite loop. At most two HIP passes. Failure clears provisional output.
- Independent checker failures must not discard a completed rewrite. Credential values must never enter public settings, logs or Git.
- Test stale responses after document edits; disabled detector makes zero calls; missing key is not 0%; abort/timeout cannot publish stale success; invalid model input never reaches inference.
- Model verification first uses the supplied general AI overview. Failure of semantic precheck stops broad quality benchmark; integration can still ship as explicitly experimental.

## Task 1 — bounded model probe and local worker (root)
- [x] Install optional Python environment in ignored `data/hip/`; download pinned base and adapter safetensors, without executing remote code.
- [x] Implement `scripts/hip_worker.py` and dependency manifest with source-target formatting, MPS/CPU/CUDA device selection, fixed rounds, input/token limits, deadline, stop handling and model revision metadata.
- [x] Write `tests/hip_worker_test.py` for formatting, validation and truncation using injected fake generation; observe fail, implement, pass.
- [x] Run one real source overview through one HIP pass; save raw output, timing and manual meaning review. Scan the exact output through accessible public ZeroGPT UI. Continue to second pass/other examples only if precheck allows.

## Task 2 — detector component (independent agent)
- [x] Test dedicated credential persistence/redaction, explicit opt-in, official endpoint requests, score normalization, 401/429/schema failures, cancellation and bounded requests with HTTP fixtures.
- [x] Implement standalone `src/detectors.mjs`, `public/detectors.js` and tests. Expose configuration, route-handler and UI lifecycle hooks for root integration; avoid edits to shared server/config/app files.
- [x] GPTZero shows separate AI-only/mixed/human probabilities. ZeroGPT uses its own measured percentage. ZeroGPT credentials follow documented bearer/API-key options; live authentication remains unverified absent a user account.
- [x] No retry and no external requests from normal tests. UI module provides settings and output panel with explicit external-send notice, manual check and auto-after-success option.

## Task 3 — app integration (root)
- [x] Write API tests for engine selection, local worker routing, size/format restrictions, one/two rounds and preserving old configuration.
- [x] Add `src/hip.mjs` local client and engine preferences; keep existing chat workflow unchanged when selected. HIP gets its trained input format, not chat skills or general system prompts.
- [x] Wire detector routes and UI lifecycle; bind results to exact source/result; leave checker off by default.
- [x] UI offers connected LLM / experimental HIP, status and rounds; controls unsupported by HIP are disabled. Missing worker explains setup. Local protection checks remain applied.

## Task 4 — verification and delivery
- [x] Run full Node/Python tests and offline browser acceptance; inspect new controls and stale/cancel/error behavior.
- [x] Independent code review, fix material issues, targeted regression checks.
- [x] Document actual model/checker findings and limits, worker startup, dependencies and external API setup; version and Docker build.
- [x] Deploy healthy at existing port, verify production credentials/preferences preserved, commit and push reviewed changes to requested public repo.

## Execution record
- Baseline: 46/46 Node tests passed. Working on `feature/hip-checkers`; production remains the existing Docker image until verification.

- Implementation and review completed. The 68 Node tests, 4 Python tests, and both offline browser suites passed. Review fixes cover silent input truncation and stale-tab provider/consent binding.
- Real HIP precheck: 19.773 seconds on MPS; ZeroGPT public UI 74.8% AI. Independent semantic gate failed on strengthened effort claim. Broad pilot and second pass intentionally stopped; no default engine change. Live authenticated detector API remains unverified without credentials.
- Delivery verified: Docker 1.3.0 healthy on the existing port; original settings/key file hashes unchanged; MPS worker ready; checker off. Integration commit `4855519` is on public GitHub main.
