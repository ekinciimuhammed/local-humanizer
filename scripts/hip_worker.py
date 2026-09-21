#!/usr/bin/env python3
"""Optional native HIP worker. No remote code, runtime downloads or text logging."""
import argparse
import hashlib
from collections import deque
import json
from pathlib import Path
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

BASE_ID = 'Qwen/Qwen3-4B-Base'
BASE_REVISION = '906bfd4b4dc7f14ee4320094d8b41684abff8539'
ADAPTER_ID = 'YixuanEvenXu/Qwen3-4B-Base-HIP-adapter'
ADAPTER_REVISION = 'cb903e699da2fb063c1b4fa6f93147f7f9d8e6af'
ROOT = Path(__file__).resolve().parents[1]

def verify_models(directory):
    try: manifest = json.loads((directory / 'manifest.json').read_text())
    except (OSError, ValueError): raise ValueError('Run scripts/setup-hip.py to download and verify the pinned models.')
    expected = {'base': (BASE_ID, BASE_REVISION), 'adapter': (ADAPTER_ID, ADAPTER_REVISION)}
    if not isinstance(manifest,list) or len(manifest)!=2: raise ValueError('Invalid model manifest.')
    seen=set()
    for entry in manifest:
        folder=entry.get('directory')
        if folder not in expected or folder in seen or (entry.get('repo'),entry.get('revision'))!=expected[folder]: raise ValueError('Unexpected HIP model revision.')
        seen.add(folder)
        weights=entry.get('weights',{})
        if not weights or set(weights)!={p.name for p in (directory/folder).glob('*.safetensors')}: raise ValueError('Model weights are missing or unexpected.')
        for name,digest in weights.items():
            if Path(name).name!=name: raise ValueError('Invalid model file name.')
            with (directory/folder/name).open('rb') as f: actual=hashlib.file_digest(f,'sha256').hexdigest()
            if actual!=digest: raise ValueError('Model checksum mismatch; run setup again.')

def make_prompt(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 6000:
        raise ValueError('HIP needs 1–6,000 characters of plain English prose.')
    if re.search(r'</?(?:source|target)_text>|[\x00-\x08\x0b\x0c\x0e-\x1f]', text):
        raise ValueError('HIP input contains reserved tags or control characters.')
    return '<source_text>\n' + text.strip() + '\n</source_text>\n\n<target_text>\n'

def clean_output(text, ended_with_eos):
    if '</target_text>' not in text and not ended_with_eos:
        raise ValueError('HIP output was truncated; no completed result was returned.')
    result = text.split('</target_text>', 1)[0].strip()
    if result.startswith('<target_text>'):
        result = result[len('<target_text>'):].lstrip()
    if not result or re.search(r'</?(?:source|target)_text>', result):
        raise ValueError('HIP returned empty or malformed prose.')
    return result

def validate_payload(payload):
    if not isinstance(payload, dict) or set(payload) - {'text', 'id', 'seed', 'timeoutSeconds'}:
        raise ValueError('Invalid HIP request fields.')
    make_prompt(payload.get('text'))
    if not isinstance(payload.get('id'), str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', payload['id']):
        raise ValueError('Invalid request ID.')
    result = {'seed': 42, 'timeoutSeconds': 180, **payload}
    for key, low, high in [('seed', 0, 2147483647), ('timeoutSeconds', 5, 600)]:
        value = result[key]
        if type(value) is not int or not low <= value <= high:
            raise ValueError('Invalid ' + key + '.')
    return result

class Model:
    def __init__(self, directory, device='auto'):
        verify_models(directory)
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel
        self.torch = torch
        if device == 'auto':
            device = 'cuda' if torch.cuda.is_available() else ('mps' if torch.backends.mps.is_available() else 'cpu')
        self.device = device
        dtype = torch.float32 if device == 'cpu' else torch.bfloat16
        self.tokenizer = AutoTokenizer.from_pretrained(directory / 'adapter', local_files_only=True, trust_remote_code=False)
        self.tokenizer.pad_token_id = self.tokenizer.eos_token_id
        base = AutoModelForCausalLM.from_pretrained(directory / 'base', local_files_only=True, trust_remote_code=False, torch_dtype=dtype, attn_implementation='sdpa')
        self.model = PeftModel.from_pretrained(base, directory / 'adapter', local_files_only=True, autocast_adapter_dtype=False)
        self.model.to(device=device, dtype=dtype).eval()

    def generate(self, payload, cancelled):
        from transformers import StoppingCriteria, StoppingCriteriaList
        torch, tok = self.torch, self.tokenizer
        encoded = tok(make_prompt(payload['text']), return_tensors='pt', truncation=False)
        input_length = encoded['input_ids'].shape[1]
        if input_length > 1024:
            raise ValueError('HIP input exceeds 1,024 tokens. Shorten it; text is never truncated.')
        encoded = {key: value.to(self.device) for key, value in encoded.items()}
        deadline = time.monotonic() + payload['timeoutSeconds']
        class Stop(StoppingCriteria):
            def __call__(self, ids, scores, **kwargs):
                return cancelled.is_set() or time.monotonic() > deadline or '</target_text>' in tok.decode(ids[0, max(input_length, ids.shape[1]-20):], skip_special_tokens=True)
        torch.manual_seed(payload['seed'])
        started = time.monotonic()
        with torch.inference_mode():
            ids = self.model.generate(**encoded, max_new_tokens=1024, do_sample=True, temperature=1.0, top_p=0.95,
                pad_token_id=tok.pad_token_id, eos_token_id=tok.eos_token_id, stopping_criteria=StoppingCriteriaList([Stop()]))[0, input_length:]
        if cancelled.is_set(): raise ValueError('HIP request cancelled.')
        if time.monotonic() > deadline: raise ValueError('HIP request timed out.')
        text = clean_output(tok.decode(ids, skip_special_tokens=True), bool(len(ids) and ids[-1].item() == tok.eos_token_id))
        return {'text': text, 'seconds': round(time.monotonic()-started, 3), 'inputTokens': input_length, 'outputTokens': len(ids), 'device': self.device,
            'model': ADAPTER_ID, 'baseRevision': BASE_REVISION, 'adapterRevision': ADAPTER_REVISION, 'seed': payload['seed']}

class Worker:
    def __init__(self, model):
        self.model = model
        self.lock = threading.Lock()
        self.state_lock = threading.Lock()
        self.pending_cancels = deque(maxlen=64)
        self.current = None

    def cancel(self, request_id):
        with self.state_lock:
            self.pending_cancels.append(request_id)
            if self.current and self.current[0] == request_id: self.current[1].set()

    def rewrite(self, payload):
        payload = validate_payload(payload)
        if not self.lock.acquire(blocking=False): raise RuntimeError('HIP is busy. Wait for the current rewrite to finish.')
        event = threading.Event()
        try:
            with self.state_lock:
                self.current = (payload['id'], event)
                if payload['id'] in self.pending_cancels: event.set()
            if event.is_set(): raise ValueError('HIP request cancelled.')
            return self.model.generate(payload, event)
        finally:
            with self.state_lock: self.current = None
            self.lock.release()

def serve(worker, port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def setup(self):
            super().setup()
            self.connection.settimeout(10)
        def send(self, status, obj):
            content = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try: self.wfile.write(content)
            except (BrokenPipeError, ConnectionResetError): pass
        def allowed(self):
            try: host = urlsplit('http://' + self.headers.get('Host', '')).hostname
            except ValueError: return False
            return host in ('127.0.0.1', 'localhost', 'host.docker.internal') and not self.headers.get('Origin') and self.headers.get('X-Humanizer-Worker') == '1'
        def do_GET(self):
            if not self.allowed(): return self.send(403, {'message': 'Use the local Humanizer application.'})
            if self.path != '/health': return self.send(404, {'message': 'Not found.'})
            self.send(200, {'status': 'ready', 'model': ADAPTER_ID, 'device': worker.model.device, 'baseRevision': BASE_REVISION, 'adapterRevision': ADAPTER_REVISION})
        def do_POST(self):
            if not self.allowed(): return self.send(403, {'message': 'Use the local Humanizer application.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 1 or length > 40000 or self.headers.get('Transfer-Encoding'): raise ValueError('Invalid request size.')
                body = self.rfile.read(length)
                if len(body) != length: raise ValueError('Incomplete request.')
                payload = json.loads(body)
                if self.path == '/cancel':
                    if not isinstance(payload, dict) or not isinstance(payload.get('id'), str) or len(payload['id']) > 64: raise ValueError('Invalid request ID.')
                    worker.cancel(payload['id'])
                    return self.send(200, {'cancelled': True})
                if self.path != '/rewrite': return self.send(404, {'message': 'Not found.'})
                self.send(200, worker.rewrite(payload))
            except (ValueError, UnicodeError) as e: self.send(400, {'message': str(e) if isinstance(e, ValueError) and not isinstance(e, json.JSONDecodeError) else 'Invalid JSON.'})
            except RuntimeError: self.send(503, {'message': 'HIP is busy or exceeded device memory. Check the worker and retry.'})
            except Exception: self.send(500, {'message': 'HIP inference failed. Check the native worker.'})
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    print(f'HIP ready on 127.0.0.1:{port} ({worker.model.device})', flush=True)
    server.serve_forever()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', type=Path, default=ROOT/'data/hip/models')
    parser.add_argument('--device', choices=['auto', 'mps', 'cuda', 'cpu'], default='auto')
    parser.add_argument('--port', type=int, default=18081)
    args = parser.parse_args()
    print('Loading pinned HIP weights locally…', flush=True)
    serve(Worker(Model(args.models, args.device)), args.port)

if __name__ == '__main__': main()
