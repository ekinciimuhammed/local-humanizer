// Explicit three-call research, no settings writes or external detector submissions.
import{copyFile,mkdtemp,rm,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{ConfigStore}from'../src/config.mjs';import{proofreadPunctuation,simplifySelection}from'../src/provider.mjs';
const tmp=await mkdtemp(join(tmpdir(),'selection-probe-')),rows=[];
try{for(const name of ['settings.json','credential.key'])await copyFile('/source-data/'+name,join(tmp,name));const store=new ConfigStore(tmp);await store.init();const config=store.get(),model=config.selectedModel;
 const cases=[{id:'commas-en',text:'If the file opens check the date. However the result may change.'},{id:'commas-tr',text:'Çantaya kalem defter ve kitap koydu.'},{id:'simple-selection',text:'Keep this note. The system enables employees to obtain information before making a decision. Keep this ending.',start:16,end:91}];
 for(const item of cases){const row={...item,model,result:null,error:null};try{row.result=await(item.id==='simple-selection'?simplifySelection(config,{model,...item}):proofreadPunctuation(config,{model,text:item.text}));}catch(e){row.error={code:e.code,message:e.message};}rows.push(row);console.log(JSON.stringify(row));}
 await writeFile('docs/evaluations/2026-09-21-selection/live-model.json',JSON.stringify(rows,null,2)+'\n',{flag:'wx'});
}finally{await rm(tmp,{recursive:true,force:true});}
