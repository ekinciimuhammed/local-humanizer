#!/usr/bin/env python3
"""Download and verify the pinned optional HIP model (about 9.1 GB)."""
import hashlib
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME',str(ROOT/'data/hip/cache'))
from huggingface_hub import snapshot_download,HfApi

MODELS=[('Qwen/Qwen3-4B-Base','906bfd4b4dc7f14ee4320094d8b41684abff8539','base'),
        ('YixuanEvenXu/Qwen3-4B-Base-HIP-adapter','cb903e699da2fb063c1b4fa6f93147f7f9d8e6af','adapter')]
def main():
    manifest=[]
    for repo,revision,folder in MODELS:
        directory=ROOT/'data/hip/models'/folder
        print('Downloading '+repo+' at '+revision,flush=True)
        snapshot_download(repo,revision=revision,local_dir=directory,max_workers=2,
            allow_patterns=['*.json','*.safetensors','*.txt','*.model','LICENSE','*.md','*.jinja'])
        info=HfApi().model_info(repo,revision=revision,files_metadata=True)
        weights={}
        for file in info.siblings:
            if not file.rfilename.endswith('.safetensors'):continue
            with (directory/file.rfilename).open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
            if not file.lfs or digest!=file.lfs.sha256:raise RuntimeError('Weight checksum mismatch: '+file.rfilename)
            weights[file.rfilename]=digest
        manifest.append({'repo':repo,'revision':revision,'directory':folder,'weights':weights})
        print('Verified '+repo,flush=True)
    (ROOT/'data/hip/models/manifest.json').write_text(json.dumps(manifest,indent=2))
    print('Ready. Run: data/hip/.venv/bin/python scripts/hip_worker.py',flush=True)

if __name__=='__main__':main()
