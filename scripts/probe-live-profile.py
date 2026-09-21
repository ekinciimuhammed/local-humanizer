"""One live localhost generation using the saved, explicitly selected profile.
Only the public general research source is submitted. No settings mutation.
"""
import json,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
directory=root/'docs/evaluations/2026-09-21-roundtrip'
source=json.loads((root/'docs/evaluations/2026-09-21-expansion/corpus.json').read_text())[0]['text']
base='http://127.0.0.1:3002'
with urllib.request.urlopen(base+'/api/settings',timeout=5) as response:settings=json.load(response)
record={'id':'live-profile','method':'application','source':source,'output':None,'complete':False,'error':None,'settings':{key:settings[key] for key in ['selectedModel','strength','writing','generation','engine']},'skillIds':settings['skills']['enabledIds']}
body={'text':source,'model':settings['selectedModel'],'strength':settings['strength']}
request=urllib.request.Request(base+'/api/humanize',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Humanizer-Request':'1'},method='POST')
start=time.monotonic()
try:
 with urllib.request.urlopen(request,timeout=130) as response:events=[json.loads(line) for line in response.read().decode().splitlines() if line.strip()]
 done=next((event for event in events if event['type']=='done'),None)
 error=next((event for event in events if event['type']=='error'),None)
 if done:record['output']=done['text'];record['complete']=True
 else:record['error']=error.get('message') if error else 'No completed application output'
except Exception as error:record['error']=str(error)
record['seconds']=round(time.monotonic()-start,3)
(directory/'live-profile.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
