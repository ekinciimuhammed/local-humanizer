# Multiple real services, before → after

2026-09-21. Version1.6 extends the existing checker flow to a primary service plus explicitly selected additional services. The UI checks them sequentially, retains each successful result if another service fails, and shows before → after with the difference in percentage points. Text/version/settings changes cancel and clear the displayed measurements. Cancellation prevents later recipients from receiving text.

## Measured disagreement on the earlier zero

The exact [previous live-app output](../2026-09-21-roundtrip/verified-output.txt) with SHA-256 `fd87826afffb65eaf190112ae9772e05a215625973e148a0a8e971503ab5951c` was used without editing:

| Website | Source | Output | Evidence |
| --- | ---: | ---: | --- |
| ZeroGPT | 100% | 0% | [Previous three verified scans](../2026-09-21-roundtrip/REPORT.md) |
| Sapling | 100% | 99.9% | [Fresh exact-text scans](sapling-web.json), 14:48:02 /14:48:08 UTC |

The final [application API comparison](application-comparison.json) repeated both source/output pairs through the actual helper: ZeroGPT100 →0 at14:53:17/20 UTC and Sapling100 →99.9 at14:53:29/36 UTC, all HTTP200 with the same hashes. This uses a temporary application settings store; production sharing consent was untouched.

This is a material disagreement, not a reason to combine their scores. Each service has its own metric and model; neither score proves preserved meaning or human authorship. The [four-new-topic evaluation](../2026-09-21-generalization/REPORT.md) likewise failed to establish general rewrite success.

## Access research and adapter behavior

- [Sapling](https://sapling.ai/ai-content-detector): visible `Fake` percentage measured successfully; integrated as an experimental public website adapter, no API key needed.
- [ZeroGPT](https://www.zerogpt.com/): existing public website adapter retained.
- [QuillBot](https://quillbot.com/ai-content-detector) and [Scribbr](https://www.scribbr.com/ai-detector/): public navigation showed security verification in the anonymous browser. No text was submitted and no working adapter was claimed.
- [GPTZero](https://gptzero.me/): accessible form, but the attempted anonymous scans did not produce a visible result in this environment. No score was inferred from marketing percentages. The existing official GPTZero API integration remains available with the user's own credentials.

No challenges were bypassed, no account sessions imported, and no authenticated service purchased. The existing ZeroGPT API integration also remains selectable. Official API integrations were tested with local fixtures only; no live API authentication is claimed.

Sapling starts by checking its own example. The adapter waits for that result and the idle button before replacing the example. Playwright's contenteditable fill initially added extra paragraph breaks; exact input verification rejected both source and output before submission ([record](sapling-input-format-rejected.json)). Using the DOM's plain-text setter and a normal input event preserves the visible text exactly. A subsequent incorrect assumption that the result container hides during scanning rejected completed scans ([record](sapling-old-lifecycle-rejected.json)). The observed website actually keeps the container visible and changes the button to `Checking…`, displays `...`, then returns to `Check Again`. The final adapter requires that fresh cycle, verifies the old percentage was reset to `...` during Checking, and verifies input again before reading the visible result. Failed measurements were retained, never converted into zeroes.

The helper accepts only fixed provider IDs and local guarded calls. No LLM or detector credentials are forwarded to it. Each scan uses a fresh anonymous browser, has a60-second deadline, and returns only percentage, exact text hash and timestamp. The application permits up to125 seconds for each source/output pair. Input remains capped at15,000 characters without truncation. Selected recipients and source/automatic sharing remain tied to a settings revision; caches are isolated by provider and exact text. External checking is still off by default.

## Validation

107 Node tests passed, including additional-recipient consent, provider-specific cache isolation, rejection of unknown destinations, cancellation before the next recipient, and partial failure rendering. Offline Chromium tests cover the multi-service UI at desktop/mobile sizes, the existing HIP/automatic-check flow, and Sapling's fresh-result lifecycle, multiline input and changed-input rejection. The screenshot files named `multi-checker-*-fixture.png` and `multi-checker-fixture.png` contain synthetic test percentages; they are UI fixtures, not live detector evidence.

The release does not change production LLM credentials, writing preferences, skills, or checker sharing consent. Punctuation remains an optional subsequent step with separately checked output versions.
