# Additional methods worth testing

Date: 2026-09-21. Read-only source research; no model downloads, generation, detector scans, or product changes were performed for this note. The proposed experiments below have **no measured local scores**. Earlier results are in [the follow-up report](../evaluations/2026-09-21-followup/REPORT.md).

The most practical additional checkpoint is **AuthorMist Originality**, because it changes the training objective and is smaller than the existing HIP backbone. **DIPPER** is a stronger architectural contrast with larger download and runtime costs. **SICO-style demonstration optimization** offers a way to change the search procedure while retaining the existing Qwen endpoint. None provides evidence of guaranteed 0% on current ZeroGPT.com.

## 1. AuthorMist Originality: detector-trained 3B checkpoint

This is Qwen2.5-3B-Instruct trained with GRPO using detector feedback, rather than the human-target supervised paraphrasing used by HIP. The released variant targets Originality.ai. Its paper reports 95.17% mean attack success across six tested detectors and 83.67% against GPTZero. Those are thresholded success rates on that paper's data and detector versions, **not document AI percentages or current ZeroGPT.com results**. The paper's embedding similarity figures are also not proof that every fact is preserved. [AuthorMist paper, v1](https://arxiv.org/html/2503.08716v1).

The available snapshot is [`authormist/authormist-originality`, revision `2866bc928850ef4910d24ef5a9179740fab72e22`](https://huggingface.co/authormist/authormist-originality/tree/2866bc928850ef4910d24ef5a9179740fab72e22). Three safetensors shards are shown as 4.98, 4.93 and 2.43 GB, approximately 12.34 GB total; download only needed model/tokenizer/config files, avoiding the uploaded `.venv` directory. Exact byte totals and hashes were not fetched in this review. A 3B model loaded in 16-bit precision has roughly 6 GB of parameter storage, an arithmetic estimate excluding inference buffers and cache. Native MPS feasibility is plausible given the larger HIP model already running, but it has not been verified here.

The authors' example uses a **raw completion**, not chat messages, temperature 0.7, top-p 0.9, sampling enabled, and 512 new tokens. Its exact prompt is:

```text
Please paraphrase the following text to make it more human-like while preserving the original meaning:

{SOURCE}

Paraphrased text:
```

The model card describes a 100–500-word target range. [Published model README](https://huggingface.co/authormist/authormist-originality/raw/main/README.md).

**License distinction:** the adapter/model card advertises MIT, but its upstream [Qwen2.5-3B-Instruct license](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) grants research/evaluation use and requires a separate license for commercial use. The derivative card alone is insufficient evidence of unrestricted commercial rights. This candidate is suitable for the authorized research probe; product distribution needs the upstream terms accounted for.

**Proposed experiment, not run:** one original-source rewrite using the published format and seed 42, followed by independent fact/meaning review and one real ZeroGPT scan. If complete and faithful, one prespecified second seed tests whether the result is merely a sampling accident. Retain failures and exact output hashes. Start from the original source, not a drifted HIP draft. Decode only generated token IDs, avoiding the README's fragile string-split extraction. A max-token stop is an incomplete generation, not a success.

## 2. DIPPER: contextual T5 paraphrasing

DIPPER uses a T5-XXL encoder–decoder, external paragraph context, and separate lexical/reordering controls. This differs from a decoder-only chat or HIP model. The original 2023 study tested watermarking, GPTZero, DetectGPT and OpenAI's former classifier. It supplies an architectural hypothesis, not a claim about today's ZeroGPT.com. [Original paper](https://arxiv.org/abs/2303.13408), [official research repository](https://github.com/martiansideofthemoon/ai-detection-paraphrases).

Snapshot: [`kalpeshk2011/dipper-paraphraser-xxl`, revision `c1fbf7a958a2aab022e9e6f81f7a3139f9e6ee3c`](https://huggingface.co/kalpeshk2011/dipper-paraphraser-xxl/commit/c1fbf7a958a2aab022e9e6f81f7a3139f9e6ee3c). The [file listing](https://huggingface.co/kalpeshk2011/dipper-paraphraser-xxl/tree/main) includes duplicate PyTorch and safetensors weight sets: 90.1 GB repository total does **not** mean both sets are needed. One five-shard safetensors set totals roughly 45.07 GB from the rounded listing. The [configuration](https://huggingface.co/kalpeshk2011/dipper-paraphraser-xxl/raw/c1fbf7a958a2aab022e9e6f81f7a3139f9e6ee3c/config.json) specifies float32 T5ForConditionalGeneration. Model card license: Apache-2.0.

The official repo asks for at least 40 GB GPU memory for reproducing its experiments and explicitly says lower-precision alternatives were untested. A 16-bit load would use roughly 22 GB for parameters alone; this is an estimate, not measured peak unified memory. Its sample code hardcodes CUDA and requires adaptation for MPS. It cannot be assumed to run through the existing Qwen chat endpoint or Ollama path. [Official runtime instructions](https://github.com/martiansideofthemoon/ai-detection-paraphrases#running-the-paraphraser-model-dipper).

The [model's own implementation](https://huggingface.co/kalpeshk2011/dipper-paraphraser-xxl) handles three-sentence windows, accumulates generated preceding context, and maps requested diversity to `100 - diversity` control codes. Its example uses lexical diversity 60, order diversity 0, top-p 0.75 and max length 512.

**Proposed experiment, not run:** two document-level arms from the original source: `(lexical, order) = (60, 0)` and `(60, 60)`, same seed and sampling settings. Each document may require multiple model generations because of sentence windows. Score full reassembled prose, not favorable individual chunks. Compare meaning before detector ranking. Verify memory headroom and one-window generation first; do not download the duplicate `.bin` weights.

## 3. SICO-inspired optimization using the connected Qwen endpoint

SICO optimizes the **demonstrations in a reusable prompt** using detector feedback, then evaluates prompt quality on a separate calibration set. It alternates sentence paraphrases and constrained word substitutions, retaining updates that improve calibration utility. The official code distinguishes demonstration data, evaluation data used during optimization, and final test data. This is different from repeatedly asking the same chat model to rewrite a target passage with new style adjectives. [SICO paper v4, algorithms 1–2](https://arxiv.org/html/2305.10847v4), [official repository](https://github.com/ColinLu50/Evade-GPT-Detector).

No additional generator weights are necessary if the algorithm is adapted to the existing Qwen endpoint. The original implementation targets ChatGPT/Vicuna and historical detector integrations, so copying its commands would not reproduce a modern Qwen/ZeroGPT experiment. The inspected root listing did not display a LICENSE file; do not assume an open-source reuse grant. An independent research implementation of the documented method avoids relying on unverified repository licensing.

**Proposed experiment, not run:** use three legitimately sourced human/AI rewrite pairs, distinct from the target passage; optimize sentence-level demonstrations for two fixed rounds; compare at most three prompt candidates on four calibration passages; freeze the best fidelity-qualified prompt and evaluate four untouched passages. Cap detector scans before starting. This smaller variant is **SICO-inspired**, not a reproduction. A generated demonstration must remain labeled generated; an agent-written paragraph is not human ground truth. Detector scores can select only among candidates already passing meaning checks. A local proxy result remains a proxy result and cannot be presented as ZeroGPT 0%.

## Why direct base completion and StealthRL are lower priority

The HIP paper's base-model experiment gives models the first sentence and scores only their newly generated continuation. It does not require the continuation to reproduce the omitted source facts. Thus the result supports a hypothesis about base-model distributions, but does not validate source-preserving rewriting by merely disabling a chat template. A no-download exploratory control could disable the existing HIP adapter and use a fixed few-shot paraphrase format on the loaded base, but this is an unvalidated extrapolation and must pass the same content check. [HIP paper v1, sections 4.1 and A.1](https://arxiv.org/html/2605.19516v1).

The same HIP paper reports a meaningful commercial-detector trade-off for DIPPER but not StealthRL. The [current StealthRL repo](https://github.com/suraj-ranganath/StealthRL) documents a Tinker-backed M2 path **and** links a [local PEFT release](https://huggingface.co/suraj-ranganath/StealthRL) for Qwen3-4B-Instruct-2507. It is therefore incorrect to say no local weights exist. The HF example contains a different adapter repository string from its actual URL, so implementation must inspect the real adapter configuration. Its local 2026 checkpoint is a possible fallback, but the independent commercial-detector negative result lowers its priority. Neither local detector AUROC nor attack success rate establishes 0% on ZeroGPT.

## Decision rule

These options are research branches, not new product defaults. Prefer AuthorMist's small checkpoint probe first, DIPPER if download/memory costs are acceptable, then calibrated demonstration optimization if checkpoint transfer remains poor. A single observed 0% would establish only that exact submitted text's displayed score at that time. Preserve source, full output, hash, model revision, settings, finish reason, detector identity, timestamp, screenshot/result, and fidelity review. Do not hide rejected samples or substitute a local heuristic for the external checker.
