# Local Humanizer

Build a private, single-user local app. Its only outbound data destination is the user-configured OpenAI-compatible endpoint. No hosted services, telemetry, CDN assets, analytics, text history, or external error logging.

Use Node.js >=22 built-ins for HTTP, fetch, crypto and testing; plain HTML/CSS/ES modules for the frontend. One process serves the UI and API. Settings are atomically persisted under `data/`; credentials are AES-GCM encrypted with a separate mode-0600 local key. This protects casual file inspection, not a compromised account or access to the entire volume. Docker persists the entire directory and publishes only on loopback.

UI: minimal connection form initially, then two large editors, enabled model dropdown, Light/Balanced/Strong, Humanize/Stop, copy. Settings contains connection testing/saving, model refresh and switches, generation settings and protected terms. External fonts and other external assets are forbidden.

Connection discovery uses GET /models. Normalize root URLs to /v1; preserve explicit non-root gateway prefixes. Keep enable choices across refresh, mark disappeared models unavailable, default clearly non-text models off, allow manual override. Never reveal stored API keys back to the browser or follow upstream redirects.

Generation uses POST /chat/completions; support SSE and ordinary JSON, retry without streaming only when the server explicitly rejects streaming and no output exists. Abort on cancellation and enforce timeouts. Return actionable status-specific errors without echoing arbitrary provider bodies or credentials.

Preserve fenced/inline code, links, URLs, email, quotations and citations using reversible placeholders. Check numbers, dates, percentages, identifiers, conservative name/organization heuristics and user-protected terms deterministically. Reject detected alterations; streamed output is provisional until final checks. Do not claim semantic equivalence or exhaustive entity detection. Use one LLM request per paragraph-preserving chunk; don't retry fact failures with extra LLM calls. Oversized atomic blocks fail clearly, with adjustable chunk size. Adjacent original context helps maintain tone and references.

Verify against an actual local mock HTTP provider: discovery, persistence, updates, streaming, nonstream fallback, cancellation, safety failures and error scenarios. Verify browser interaction and responsive layout. Document offline use after obtaining Node or Docker image; Docker build needs its base image available.
