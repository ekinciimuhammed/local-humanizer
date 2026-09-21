# HIP integration and bounded verification — 2026-09-21

HIP and optional external checker integrations are implemented in v1.3.0. **The detector-success objective is not solved.** The first real HIP output failed the predeclared meaning-preservation gate; it therefore remains experimental and the connected LLM remains the default.

## Measured quality result

| Observation | Result |
|---|---|
| Supplied AI overview, previous same-day ZeroGPT scan | 100% AI |
| Exact first HIP output, new ZeroGPT public UI scan | 74.8% AI |
| Native worker latency including local request | 19.773 seconds |
| Deterministic preservation checks | No issues detected |
| Independent blinded semantic review | Fail: important claim strengthened |

The baseline comes from the [earlier source scan](../2026-09-21-natural-v2/zerogpt-source.json), not a new simultaneous control. This is one document, one public checker, and no evidence of a general improvement or reliable authorship classification. The real checker called the output mixed AI/GPT signals; 74.8% is its reported value, not an independently established probability of authorship.

The source says work can be completed faster; HIP strengthened that to requiring little employee time or effort. See the [blinded review](blind-review.md), [raw input/output and worker metadata](screenshot-1-pass.json), [public detector record](zerogpt-hip-first-pass.json), and [actual screenshot](zerogpt-hip-first-pass.png).

The broader held-out pilot and second paraphrasing pass were stopped under the [predeclared protocol](../../research/2026-09-21-method-decision.md). There was no prompt search, detector-driven retry, or automatic rewrite loop. A separate app-to-worker smoke check repeated the same source and seed solely to verify Docker/native transport: it completed in 20.028 seconds and returned exactly the same output. It is not a new candidate or a second paraphrasing pass. Its complete events are recorded in [app-integration.json](app-integration.json). Total for this task: two native inference calls, one live public detector scan, zero authenticated detector API calls.

## Verified implementation

- Downloaded the pinned Qwen3-4B-Base and HIP adapter safetensors, about 9.1 GB total. Verified upstream SHA-256 values; see [model manifest](model-manifest.json). Runtime uses local files and does not execute remote model code.
- Native worker ran on Apple MPS with bfloat16. Python 3.14.7; PyTorch 2.14.0; Transformers 4.57.6; PEFT 0.19.1. Other devices have implementation support but were not hardware-tested here.
- One or two explicit HIP passes, bounded input/output tokens and timeout, trained source/target format, cancellation and truncation rejection. No connected-provider credentials or chat skills are sent to the worker. Two-pass orchestration was tested with fixtures, not validated for real model quality.
- GPTZero and ZeroGPT official API adapters, separate encrypted credentials, opt-in manual or automatic checking, source comparison, snapshot-bound results, provider-specific score semantics, cancellation, bounded cache, and no retry loop.
- 68 Node tests passed on the host and in the final Docker image with external networking disabled. Four Python worker tests passed. Both offline Chromium acceptance suites passed, including preservation errors, long-input retention, cancellation, stale results, settings persistence and mobile layout. Browser screenshots in `docs/screenshots` use mock scores and are not live detector measurements.
- Independent code review found silent input truncation and stale-tab provider/consent risks. Both were fixed, covered by regression tests, and cleared in scoped rereview.

**Live authenticated detector API calls were not verified:** no detector account credentials were supplied. Adapter and UI tests use fixtures; the 74.8% measurement came from the actual public ZeroGPT website. Enter the appropriate account key in Settings to use background checking. Credentials never belong in this report or chat.

Version 1.3.0 was deployed healthy at the existing local port. Read-only production checks confirmed the connected Qwen engine remains selected, external checking and auto-check remain disabled, and the native MPS worker is ready. Existing settings and credential-key file hashes are identical before and after the upgrade.

## Reproduce deliberately

Follow [worker setup](../../../README.md#local-hip-engine), then explicitly run:

```bash
node scripts/evaluate-hip.mjs screenshot 1
node scripts/smoke-hip-app.mjs
```

These commands perform real local inference and overwrite their evidence files; they are not run by `npm test`. The smoke check uses temporary app settings and leaves existing user settings untouched. To repeat the public measurement, submit exactly the recorded `output` to the ZeroGPT website and retain its displayed result; service revisions can change the score. The optional checker API configuration is documented in the README.
