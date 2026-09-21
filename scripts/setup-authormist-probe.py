"""Research-only checkpoint download. Upstream Qwen research terms also apply.
Never download or execute the repository's uploaded virtual environment or code.
"""
import hashlib, json, urllib.request
from pathlib import Path
from huggingface_hub import hf_hub_download
repo='authormist/authormist-originality'
revision='2866bc928850ef4910d24ef5a9179740fab72e22'
directory=Path('data/authormist-probe')
directory.mkdir(parents=True,exist_ok=True)
metadata=json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}/revision/{revision}?blobs=true',timeout=30))
names=['README.md','config.json','generation_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','added_tokens.json','merges.txt','vocab.json','model.safetensors.index.json','model-00001-of-00003.safetensors','model-00002-of-00003.safetensors','model-00003-of-00003.safetensors']
manifest=[]
for name in names:
    print('Downloading',name,flush=True)
    path=Path(hf_hub_download(repo,name,revision=revision,local_dir=directory))
    with path.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
    info=next(item for item in metadata['siblings'] if item['rfilename']==name)
    expected=info.get('lfs',{}).get('sha256')
    if expected and expected!=digest:raise RuntimeError('Model hash mismatch')
    manifest.append({'repo':repo,'revision':revision,'file':name,'size':path.stat().st_size,'sha256':digest,'upstreamLfsVerified':bool(expected)})
    print('Verified',name,path.stat().st_size,flush=True)
Path('docs/evaluations/2026-09-21-expansion/authormist-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
