"""One explicitly authorized research request through the existing CLI login.

No credential reading/copying. No user configuration, file tools or app tools.
Only sanitized result metadata and the supplied general passage are retained.
"""
import json,subprocess,tempfile,time,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
directory=root/'docs/evaluations/2026-09-21-roundtrip'
variant=sys.argv[1] if len(sys.argv)>1 else 'codex-writing'
if variant not in ['codex-writing','codex-astra','codex-lexical','codex-example']:raise SystemExit('Unknown explicit probe')
prompt=(directory/('codex-example-prompt.txt' if variant=='codex-example' else 'codex-lexical-prompt.txt' if variant=='codex-lexical' else 'codex-prompt.txt')).read_text()
source=json.loads((root/'docs/evaluations/2026-09-21-expansion/corpus.json').read_text())[0]['text']
record={'id':variant,'source':source,'prompt':prompt,'provider':'Codex CLI existing ChatGPT login','output':None,'error':None}
start=time.monotonic()
with tempfile.TemporaryDirectory(prefix='humanizer-cli-probe-') as working:
    command=['codex','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-C',working,'-c','approval_policy="never"','-c','web_search="disabled"','-c','project_doc_max_bytes=0','--json','-o',str(Path(working)/'output.txt')]
    for feature in ['shell_tool','unified_exec','apps','plugins','hooks','multi_agent','computer_use','browser_use','image_generation','skill_search','skill_mcp_dependency_install','goals']:
        command += ['--disable',feature]
    if variant in ['codex-astra','codex-lexical','codex-example']:
        command+=['--model','gpt-6-astra','-c','model_reasoning_effort="high"']
        record['requestedModel']='gpt-6-astra'
        record['requestedReasoningEffort']='high'
    command+=['-']
    try:
        result=subprocess.run(command,input=prompt,text=True,capture_output=True,timeout=180)
        record['exitCode']=result.returncode
        match=re.search(r'^model:\s*(\S+)',result.stderr,re.M)
        record['reportedModel']=match.group(1) if match else None
        events=[]
        for line in result.stdout.splitlines():
            try:events.append(json.loads(line))
            except json.JSONDecodeError:pass
        items=[event.get('item',{}) for event in events if event.get('type','').startswith('item.')]
        unexpected=sorted({item.get('type','unknown') for item in items if item.get('type') not in ['agent_message','reasoning']})
        record['unexpectedItemTypes']=unexpected
        complete=[event for event in events if event.get('type')=='turn.completed']
        if complete:record['usage']=complete[-1].get('usage')
        if result.returncode or not complete:
            record['error']='CLI did not produce a completed turn'
            # Do not retain raw stderr, auth diagnostics, tokens or environment.
            record['eventTypes']=[event.get('type') for event in events]
        elif unexpected:record['error']='Unexpected non-writing item; reject research output'
        else:
            record['output']=(Path(working)/'output.txt').read_text().strip()
            record['complete']=bool(record['output'])
    except subprocess.TimeoutExpired:record['error']='CLI request exceeded the fixed 180-second deadline'
record['seconds']=round(time.monotonic()-start,3)
(directory/(variant+'.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
