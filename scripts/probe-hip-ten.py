"""Explicit research continuation of the recorded HIP trajectory, never product runtime."""
import json, urllib.request, uuid
from pathlib import Path
directory = Path('docs/evaluations/2026-09-21-expansion')
previous = json.loads(Path('docs/evaluations/2026-09-21-followup/hip4-raw.json').read_text())
source = json.loads(Path('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json').read_text())['records'][0]['source']
draft = previous['output']
for round_number in range(5, 11):
    payload = {'id': str(uuid.uuid4()), 'text': draft, 'seed': 41 + round_number, 'timeoutSeconds': 180}
    request = urllib.request.Request('http://127.0.0.1:18081/rewrite', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'X-Humanizer-Worker': '1'})
    with urllib.request.urlopen(request, timeout=200) as response:
        result = json.load(response)
    record = {'id': f'hip{round_number}', 'source': source, 'draft': draft, 'round': round_number, 'output': result['text'], 'worker': result}
    (directory / f'hip{round_number}.json').write_text(json.dumps(record, indent=2)+'\n')
    draft = result['text']
    print(json.dumps({'round': round_number, 'seconds': result['seconds'], 'characters': len(draft)}), flush=True)
