import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { AppError } from './provider.mjs';
import { protectText, validateFacts } from './preservation.mjs';
import { compareWriting } from './style-analysis.mjs';

export const defaultHipUrl = process.env.HUMANIZER_HIP_URL || `http://${existsSync('/.dockerenv') ? 'host.docker.internal' : '127.0.0.1'}:18081`;
function endpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost','host.docker.internal','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('HIP worker URL must be a local HTTP origin.');
  return url.origin;
}
export function hipInput(text, terms = []) {
  if (typeof text !== 'string' || !text.trim() || text.length > 6000) throw new AppError('HIP supports up to 6,000 characters of plain English prose. Use your connected LLM for longer documents.',400);
  if (protectText(text,terms).spans.length || /^(?: {0,3}(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s)|\s*\|)/m.test(text) || /<\/?(?:source|target)_text>|__KEEP_|[\x00-\x08\x0b\x0c\x0e-\x1f]|[^\x00-\x7f\p{P}\p{Z}]/u.test(text)) throw new AppError('HIP is experimental and supports plain English prose only, without code, quotations, citations, links or protected terms. Use the connected LLM for this document.',400);
}
export class HipClient {
  constructor(url = defaultHipUrl) { this.url = endpoint(url); }
  async request(path,body,signal) {
    try {
      const res = await fetch(this.url+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,headers:{'Content-Type':'application/json','X-Humanizer-Worker':'1'},signal,redirect:'manual'});
      let raw=''; const decoder=new TextDecoder();
      for await (const part of res.body) {raw+=decoder.decode(part,{stream:true}); if(raw.length>64000)throw new AppError('HIP worker response is too large.');}
      raw+=decoder.decode();
      if (!res.ok) {
        if(res.status>=300&&res.status<400)throw new AppError('HIP worker redirects are not followed.');
        // Only known, non-text error categories cross the worker boundary.
        if(/1,024 tokens/.test(raw))throw new AppError('HIP input exceeds 1,024 tokens. Shorten it; text was not truncated.',400);
        if(/truncated/.test(raw))throw new AppError('HIP output was truncated and discarded.');
        if(/timed out/.test(raw))throw new AppError('HIP worker timed out.');
        throw new AppError(res.status===503?'HIP worker is busy or exceeded device memory. Wait or restart the worker.':'HIP worker rejected this request. Check its setup and input limits.');
      }
      return JSON.parse(raw);
    } catch(error) {
      if(signal?.aborted)throw new AppError(signal.reason?.name==='TimeoutError'?'HIP worker timed out.':'HIP request cancelled.',504);
      if(error instanceof AppError)throw error;
      throw new AppError('Cannot reach a valid HIP worker. Start the native worker on port 18081; see README → Local HIP engine.',503);
    }
  }
  async status() {
    try { const value=await this.request('/health',null,AbortSignal.timeout(2000)); return {ready:value.status==='ready',device:typeof value.device==='string'?value.device.slice(0,30):'unknown',model:'Qwen3-4B-Base + HIP'}; }
    catch { return {ready:false,message:'Start the native HIP worker on port 18081. See README → Local HIP engine.'}; }
  }
  async rewrite(text,signal,seed=42) {
    const id=randomUUID(); const combined=AbortSignal.any([signal,AbortSignal.timeout(185_000)]);
    const cancel=()=>{ void this.request('/cancel',{id},AbortSignal.timeout(3000)).catch(()=>{}); };
    combined.addEventListener('abort',cancel,{once:true});
    try {
      combined.throwIfAborted();
      const result=await this.request('/rewrite',{text,id,seed,timeoutSeconds:180},combined);
      if(typeof result.text!=='string'||!result.text.trim()||result.text.length>16000)throw new AppError('HIP worker returned empty or invalid output.');
      return result.text;
    } finally {combined.removeEventListener('abort',cancel);}
  }
}
export async function runHip(client,source,config,emit,signal) {
  let result=source;
  for(let round=1;round<=config.engine.hipRounds;round++) {
    signal.throwIfAborted();
    hipInput(result,config.humanizer.protectedTerms);
    emit({type:'progress',current:round,total:config.engine.hipRounds,stage:'hip'});
    result=await client.rewrite(result,signal,42+round-1);
    signal.throwIfAborted();
    const issues=validateFacts(source,result,config.humanizer.protectedTerms);
    if(issues.length)throw new AppError(`HIP fact preservation check failed (pass ${round}). ${issues.slice(0,3).join('; ')}. Result discarded.`,422);
    emit({type:'replace',text:result});
  }
  emit({type:'done',text:result,engine:'hip',rounds:config.engine.hipRounds,chunks:1,reviewed:false,tone:'HIP',skills:[],writingNotes:compareWriting(source,result,config.humanizer.protectedTerms)});
}
