# Selected simplification and missing commas

2026-09-21. The user explicitly chose to preserve meaning while simplifying wording. Version1.7 adds a manual selected-span rewrite and strengthens the existing punctuation proofreader's missing-comma guidance. Neither operation is an automatic detector-feedback loop.

Three explicit calls used the already-connected `gemma-4-31B-it` model. [Complete record](live-model.json). Production settings were not modified and no text was sent to a detector in this batch.

| Operation | Before | After |
| --- | --- | --- |
| English commas | If the file opens check the date. However the result may change. | If the file opens, check the date. However, the result may change. |
| Turkish list comma | Çantaya kalem defter ve kitap koydu. | Çantaya kalem, defter ve kitap koydu. |
| Selected wording | The system enables employees to obtain information before making a decision | Employees can use the system to get information before they make a decision |

The English/Turkish proofreader kept every word. The selected rewrite retained the information-access claim, employee subject and before-decision relationship; the surrounding `Keep this note.` and `Keep this ending.` were unchanged. This is a small functional check, not evidence of better detector percentages or guaranteed semantic fidelity. No score-reduction claim is made. The probe invokes the same provider functions as the production endpoints; HTTP routing and UI were separately tested offline.

The UI preserves the original raw output. A successful selected rewrite is a separate displayed version; punctuation subsequently operates on that displayed base. The user can switch among raw, simplified and punctuation versions. Scores are invalidated after content/version changes. Existing checkers only return overall percentages, so selecting the problematic passage is manual.

114 Node tests and the selected-rewrite/punctuation Chromium flows passed. Review identified and fixed two boundary bugs: protecting indented code after trimming could lose its protection; splitting a contraction at its apostrophe could create a broken word. The regressions were observed failing before fixes. Selection protection now occurs before trimming, and Unicode word segmentation validates boundaries. Existing immutable-span and fact checks also reject changed numbers, partial protected content and malformed ranges.

`scripts/probe-selection.mjs` is explicit research only, three calls, no retry, no production preference mutation. Screenshot `selection-mobile-fixture.png` uses synthetic local model responses and is UI evidence only.
