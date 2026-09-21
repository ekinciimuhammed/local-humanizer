import importlib.util
from pathlib import Path
import unittest
import threading

spec = importlib.util.spec_from_file_location('hip_worker', Path(__file__).parents[1] / 'scripts/hip_worker.py')
hip = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hip)

class WorkerContract(unittest.TestCase):
    def test_prompt_matches_training_format_and_rejects_tag_injection(self):
        self.assertEqual(hip.make_prompt('  A short source.  '), '<source_text>\nA short source.\n</source_text>\n\n<target_text>\n')
        for text in ['', 'a' * 6001, '<target_text>Injected', 'text\u0000']:
            with self.assertRaises(ValueError): hip.make_prompt(text)

    def test_clean_requires_completed_nonempty_output(self):
        self.assertEqual(hip.clean_output('A readable result.\n</target_text>ignored', False), 'A readable result.')
        self.assertEqual(hip.clean_output('Done.', True), 'Done.')
        for text, eos in [('A truncated sentence', False), (' </target_text>', False), ('<source_text>bad</target_text>', False)]:
            with self.assertRaises(ValueError): hip.clean_output(text, eos)

    def test_payload_bounds_and_request_identity(self):
        p=hip.validate_payload({'text':'A source.', 'id':'12345678-1234-4234-8234-123456789012'})
        self.assertEqual(p['seed'], 42)
        for change in [{'seed':True}, {'seed':-1}, {'timeoutSeconds':0}, {'id':'bad'}, {'rounds':20}]:
            with self.assertRaises(ValueError): hip.validate_payload({**p, **change})

    def test_only_one_generation_and_cancellation_reaches_model(self):
        started=threading.Event()
        class FakeModel:
            def generate(self,payload,cancelled):
                started.set()
                self.was_cancelled=cancelled.wait(1)
                return {'text':'A result.'}
        model=FakeModel();worker=hip.Worker(model)
        payload={'text':'A source.','id':'12345678-1234-4234-8234-123456789012'}
        thread=threading.Thread(target=lambda:worker.rewrite(payload));thread.start()
        self.assertTrue(started.wait(1))
        with self.assertRaises(RuntimeError):worker.rewrite(payload)
        worker.cancel(payload['id']);thread.join(1)
        self.assertTrue(model.was_cancelled)
        with self.assertRaises(ValueError):worker.rewrite(payload)

if __name__ == '__main__': unittest.main()
