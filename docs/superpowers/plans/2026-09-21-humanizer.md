# Humanizer Implementation Plan

> Execute inline with superpowers:executing-plans. The user explicitly requested a short plan followed directly by implementation; approval handoffs are superseded by that instruction.

**Goal:** Deliver a usable local humanizer with automatic model discovery and Docker.
**Architecture:** One Node HTTP server, browser ES modules, encrypted local JSON settings.
**Tech Stack:** Node.js >=22 built-ins, HTML/CSS, Docker Compose.
**Spec:** docs/superpowers/specs/2026-09-21-humanizer-design.md

## Global Constraints
- No runtime third-party dependencies, cloud services, telemetry or external assets.
- Only the configured LLM receives text; API keys never returned by settings APIs.
- Main screen stays limited to two editors and essential controls.
- Docker persists config and binds its published port to localhost.

## Review Focus
- Refresh preserves disabled choices and marks missing models unavailable.
- Stream ending without completion must not appear successful.
- Altered numbers/links/code must never be presented as verified output.
- Connection failures and credential changes must not expose secrets or reuse keys for another host.
- Long documents preserve paragraph boundaries and cancellation halts upstream work.

## Task 1: Core data and protection
Files: src/config.mjs, src/models.mjs, src/preservation.mjs; tests/core.test.mjs.
- [x] Write Node tests for normalization, model refresh, credential redaction/persistence, protected content and chunking; run `node --test tests/core.test.mjs` and observe missing implementation.
- [x] Implement normalizeBaseUrl, mergeModels, ConfigStore, protectText, validateFacts, splitText. Use exact deterministic tests in tests/core.test.mjs as executable interface contracts.
- [x] Run the core suite and resolve failures.

## Task 2: Provider and local API
Files: src/provider.mjs, src/server.mjs; tests/integration.test.mjs, tests/mock-provider.mjs.
- [x] Write HTTP tests against a local mock covering full discovery/generation flow, persistence, fallbacks, errors, safety and cancellation; observe failure before implementation.
- [x] Implement endpoint-only fetch, SSE framing, request lifecycle and same-origin local API.
- [x] Run `node --test` and inspect all failures.

## Task 3: UI and packaging
Files: public/index.html, public/styles.css, public/app.js, Dockerfile, compose.yaml, README.md.
- [x] Implement accessible connection, editing and settings screens against tested API contracts.
- [x] Test with browser: connect, toggle, refresh, generate, copy, cancel, settings persistence and responsive layout.
- [x] Validate Docker Compose and build/start if Docker available; document precise limits otherwise.

## Task 4: Review and delivery
- [x] Run a fresh independent code review, fix material findings with regression tests.
- [x] Run `npm test`, syntax checks, Docker checks and browser checks as appropriate.
- [x] Update README with operation, offline prerequisites, protection limits and verification evidence.
