"""Opt-in research model download; uses the existing HIP venv and writes ignored data only.
Weights are subject to the Gemma terms: https://ai.google.dev/gemma/terms .
No model code is executed. File hashes and revision are retained in evaluation evidence.
"""
import json,hashlib,urllib.request
from pathlib import Path
from huggingface_hub import hf_hub_download
repo='jialinyyzz/humanizer-gemma-4-e4b';rev='93d4eee64b92e8b4ef331540fe1aadac0724dc00'
dest=Path('data/gemma-probe')
dest.mkdir(parents=True,exist_ok=True)
meta=json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}/revision/{rev}?blobs=true',timeout=30))
files=['prompt_format.json','README.md','gguf/humanizer-gemma-4-e4b-Q6_K.gguf']
manifest=[]
for name in files:
 print('Downloading',name,flush=True)
 path=Path(hf_hub_download(repo,name,revision=rev,local_dir=dest))
 actual=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
 info=next(f for f in meta['siblings'] if f['rfilename']==name)
 expected=info.get('lfs',{}).get('sha256')
 if expected and actual!=expected:raise RuntimeError('Hash mismatch')
 manifest.append({'repo':repo,'revision':rev,'file':name,'size':path.stat().st_size,'sha256':actual,'upstreamLfsVerified':bool(expected)})
 print('Verified',name,path.stat().st_size,flush=True)
Path('docs/evaluations/2026-09-21-followup/model-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

(dest/"Modelfile").write_text('FROM ./gguf/humanizer-gemma-4-e4b-Q6_K.gguf\nTEMPLATE """{{ .Prompt }}"""\nPARAMETER temperature 0.85\nPARAMETER top_p 0.95\nPARAMETER num_predict 900\nPARAMETER num_ctx 4096\nPARAMETER seed 42\n')
