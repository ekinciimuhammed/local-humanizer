---
name: humanizer
description: Use when writing or revising human-facing prose in German or English, especially when the text should sound natural, less formulaic, or less like generic AI writing; do not use for code, short UI strings, legal text, or API references.
license: MIT
metadata:
  author: andreaskonopka
  version: "0.1.0"
---

# Humanizer

Remove recurring AI-writing patterns without changing meaning or inventing
support. Structure is stronger evidence than any individual word.

## Scope

Use for articles, landing pages, support replies, email, release notes, reports,
and narrative documentation. Do not use for code, commit messages, API
references, short UI strings, or legal text.

## Workflow

1. Identify the language and document type. Preserve its register, formatting,
   and point of view.
2. Read the matching catalog:
   - German: [references/patterns-de.md](references/patterns-de.md)
   - English: [references/patterns-en.md](references/patterns-en.md)
3. Make a structure pass with the patterns below.
4. Make a language pass. Judge repetition and clustering; never ban ordinary
   words mechanically.
5. Match the source language's typography and the target platform.
6. Read for rhythm. Verify every fact, number, quotation, name, place, and
   example against the source or supplied context.

If required facts are missing, ask for them or shorten the claim.

## Structural patterns

| Pattern | Typical symptom | Correction |
| --- | --- | --- |
| Rule of three | Lists repeatedly contain exactly three polished items | Keep only what matters; use a different count unless the subject naturally has three parts |
| Pivot punctuation | Repeated statement followed by a punchy dash or colon | Rebuild most pivots as complete sentences or clauses |
| Interpretive tail | A claim ends with a vague explanation of what it “shows,” “highlights,” or “reflects” | Remove the interpretation or support it in a separate sentence |
| Concession-reset arc | A difficulty is immediately neutralized with generic reassurance | Let it stand, or qualify the reassurance with evidence |
| Harmonized ending | The ending repeats the thesis, predicts a bright future, or invents a takeaway | End with the last supported fact or next step |
| False range | “From X to Y” presents unrelated examples as a spectrum | Name the items directly or keep the one that matters |
| Negative parallelism | “Not only X but also Y” or “not X, but Y” carries a simple claim | State the positive claim directly |
| Parallel rhythm | Several sentences or paragraphs share the same length and syntax | Vary sentence length and construction where the content supports it |

## Editing rules

- Preserve factual propositions, uncertainty, attributed opinions, quotations,
  and useful formatting. A rhetorical tail with no independent claim may be
  removed; a substantive judgment must remain a judgment.
- Prefer deletion to unsupported elaboration. Concrete detail must come from
  the source, supplied context, or knowledge the task explicitly permits.
- Do not add an illustrative example unless the user requests one. Mark it as
  hypothetical and keep it separate from claims about the subject.
- Repeat the clearest term instead of forcing synonyms.
- Never add mistakes, slang, or opinions merely to simulate human voice.
- Never optimize for detector scores or promise detector evasion.

## Document-type calibration

| Document type | Editing posture |
| --- | --- |
| Article or marketing page | Allow a point of view; scrutinize inflated claims, canned imagery, and tidy endings |
| Support reply or email | Keep useful steps; remove ceremonial reassurance and benefit taglines |
| Release notes | Keep functional labels and lists; remove sales language |
| Report or documentation | Stay restrained; do not manufacture personality |

## Final check

- Same factual meaning, uncertainty, and substantive judgments.
- No new facts, scenes, sources, quotations, or numbers.
- Structure fixed before vocabulary.
- Typography fits the language and platform.
- Varied rhythm without theatrical phrasing.
- No unsupported closing paragraph.
