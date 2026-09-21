# Third-party writing guides

Humanizer includes compact, modified writing guides derived from the following MIT-licensed projects. Adaptations are not official versions of those projects, and no upstream author endorses this application. The app loads only our `skills/*/SKILL.md` files. The full original skill text is retained as offline reference in the respective `references/UPSTREAM.md`; it is not automatically sent to the model.

| Local profile | Upstream | Fixed commit | Copyright / license |
|---|---|---|---|
| Natural writing | https://github.com/blader/humanizer | `9862685f575c65a8247f90369951df1b3416e3d6` | Copyright (c) 2025 Siqi Chen — MIT |
| Structure & clarity | https://github.com/andreaskonopka/humanizer | `862609a2caf3cadb63b9bef78576e6f5a1ed4e19` | Copyright (c) 2026 Andreas Konopka — MIT |
| Voice & rhythm | https://github.com/harshaneel/humanize | `4ec797314537ec9c2105f276d4561d240a0390ba` | Copyright (c) 2026 Harshaneel Gokhale — MIT |

Each adapted profile carries the complete upstream MIT permission notice in `LICENSE.upstream`. SHA-256 hashes of the vendored upstream files and exact source paths are recorded in `skills/catalog.json`. Review date: 2026-09-21.

The Turkish clarity profile is authored for this project and is provided under the MIT license in `skills/turkish-clarity/LICENSE`.

## Adaptation decisions

Retained: structural editing, source voice/register, meaningful rhythm, restrained vocabulary, uncertainty, stable technical nouns, final silent revision and targeted editorial checks.

Excluded: detector scoring/optimization, external detector services, invented anecdotes/names/numbers, artificial errors, rigid sentence-length quotas, blanket bans on punctuation, automatic removal of factual qualifications, and the original skills' tool/file-editing protocols. We also retain meaningful Markdown structure and every supported claim even where an upstream example deletes them.

The presence of a style pattern does not establish authorship. No comparative quality benchmark or detector-evasion claim is made. License files and source snapshots are bundled for attribution and inspection, not for execution.
