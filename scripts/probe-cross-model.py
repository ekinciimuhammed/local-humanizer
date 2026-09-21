"""Explicit three-arm cross-model research, one HIP call per saved draft."""
import json, urllib.request, uuid
from pathlib import Path
directory=Path('docs/evaluations/2026-09-21-expansion')
for candidate in ['demo-qwen','demo-gemma','claims-gemma']:
    parent=json.loads((directory/(candidate+'.json')).read_text())
    request=urllib.request.Request('http://127.0.0.1:18081/rewrite',data=json.dumps({'id':str(uuid.uuid4()),'text':parent['output'],'seed':42,'timeoutSeconds':180}).encode(),headers={'Content-Type':'application/json','X-Humanizer-Worker':'1'})
    with urllib.request.urlopen(request,timeout=200) as response: result=json.load(response)
    row={'id':'cross-'+candidate,'source':parent['source'],'draft':parent['output'],'output':result['text'],'worker':result}
    (directory/(row['id']+'.json')).write_text(json.dumps(row,indent=2)+'\n')
    print(json.dumps({'id':row['id'],'seconds':result['seconds'],'output':row['output']}),flush=True)
