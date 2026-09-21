"""One explicit local research sample with published AuthorMist completion format."""
import json,time,hashlib
from pathlib import Path
import torch
from transformers import AutoTokenizer,AutoModelForCausalLM
directory=Path('data/authormist-probe')
output_dir=Path('docs/evaluations/2026-09-21-expansion')
manifest=json.loads((output_dir/'authormist-manifest.json').read_text())
for row in manifest:
    if row['file'].endswith('.safetensors'):
        with (directory/row['file']).open('rb') as stream:
            if hashlib.file_digest(stream,'sha256').hexdigest()!=row['sha256']:raise RuntimeError('Weight checksum mismatch')
source=json.loads(Path('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json').read_text())['records'][0]['source']
prompt='Please paraphrase the following text to make it more human-like while preserving the original meaning:\n\n'+source+'\n\nParaphrased text:'
tokenizer=AutoTokenizer.from_pretrained(directory,local_files_only=True,trust_remote_code=False)
model=AutoModelForCausalLM.from_pretrained(directory,local_files_only=True,trust_remote_code=False,torch_dtype=torch.bfloat16,attn_implementation='sdpa').to('mps').eval()
tokens=tokenizer(prompt,return_tensors='pt').to('mps');torch.manual_seed(42)
started=time.monotonic()
with torch.inference_mode():
    output=model.generate(**tokens,max_new_tokens=512,do_sample=True,temperature=.7,top_p=.9,pad_token_id=tokenizer.eos_token_id)[0,tokens.input_ids.shape[1]:]
record={'id':'authormist','source':source,'output':tokenizer.decode(output,skip_special_tokens=True).strip(),'seconds':round(time.monotonic()-started,3),'prompt':prompt,'model':'authormist/authormist-originality','revision':'2866bc928850ef4910d24ef5a9179740fab72e22','seed':42,'temperature':.7,'topP':.9,'maxNewTokens':512,'dtype':'bfloat16','device':'mps','outputTokens':len(output),'lastTokenId':output[-1].item() if len(output) else None,'eosTokenIds':model.generation_config.eos_token_id,'topK':model.generation_config.top_k,'repetitionPenalty':model.generation_config.repetition_penalty,'completed':bool(len(output) and output[-1].item() in (model.generation_config.eos_token_id if isinstance(model.generation_config.eos_token_id,list) else [model.generation_config.eos_token_id]))}
(output_dir/'authormist.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record),flush=True)
