"""Four frozen local continuation controls; research only, not the worker API."""
import json,time
from pathlib import Path
from contextlib import nullcontext
from hip_worker import Model,make_prompt,clean_output
from transformers import StoppingCriteria,StoppingCriteriaList
directory=Path('docs/evaluations/2026-09-21-expansion')
source=json.loads(Path('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json').read_text())['records'][0]['source']
model=Model(Path('data/hip/models'),'mps');torch=model.torch;tokenizer=model.tokenizer
examples=[
 ('Online appointment booking enables customers to schedule visits outside business hours. Employees may receive fewer routine scheduling calls, but the system requires up-to-date availability information. Telephone booking should remain available to customers who cannot use the online service. Staff must still handle cancellations and unusual requests.',
  'The shop is closed, but a customer can still book an appointment. Staff may get fewer calls from people simply wanting a slot. The catch is the calendar: somebody has to keep it current. Some customers cannot book online at all, so the phone option needs to stay. And staff still have cancellations and awkward requests to deal with.'),
 ('A shared project calendar may help team members coordinate their work by making deadlines visible. Its usefulness depends on regular updates. A calendar does not replace conversations about competing priorities, and employees should be able to ask for clarification when a deadline changes.',
  'Putting deadlines where everyone can see them may make it easier to coordinate work. That is what a shared calendar offers, as long as people keep it up to date. It cannot settle a clash of priorities for them. They still need to talk, and anyone puzzled by a changed deadline should be able to ask about it.'),
]
plans=[('prefix-time','A lot of the appeal comes down to time.',True),('prefix-risks','There is a lot to weigh up when an organization considers using AI.',True),('prefix-work','Some work takes a great deal of time and hands-on effort.',True),('base-demonstrations','',False)]
for name,prefix,use_adapter in plans:
    prompt=make_prompt(source)+prefix
    if not use_adapter:prompt='\n\n'.join(make_prompt(a)+b+'\n</target_text>' for a,b in examples)+'\n\n'+prompt
    encoded=tokenizer(prompt,return_tensors='pt').to('mps');length=encoded.input_ids.shape[1]
    class Stop(StoppingCriteria):
        def __call__(self,ids,scores,**kwargs):
            return '</target_text>' in tokenizer.decode(ids[0,max(length,ids.shape[1]-20):],skip_special_tokens=True)
    torch.manual_seed(42);started=time.monotonic()
    with torch.inference_mode(), (nullcontext() if use_adapter else model.model.disable_adapter()):
        ids=model.model.generate(**encoded,max_new_tokens=768,do_sample=True,temperature=1,top_p=.95,pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id,stopping_criteria=StoppingCriteriaList([Stop()]))[0,length:]
    raw=prefix+tokenizer.decode(ids,skip_special_tokens=True)
    record={'id':name,'source':source,'prefix':prefix,'adapterEnabled':use_adapter,'seed':42,'temperature':1,'topP':.95,'raw':raw,'output':None,'error':None,'seconds':round(time.monotonic()-started,3)}
    try:record['output']=clean_output(raw,bool(len(ids) and ids[-1].item()==tokenizer.eos_token_id))
    except ValueError as error:record['error']=str(error)
    (directory/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
