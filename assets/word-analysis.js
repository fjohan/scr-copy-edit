/* Deterministic analysis of the recorded log; no changes to stored documents. */
(function (root) {
'use strict';
const wordPattern = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
function tokens(text) { return Array.from(text.matchAll(wordPattern), m => ({text:m[0],start:m.index,end:m.index+m[0].length})); }
const union = lists => [...new Set(lists.flat())];
function analyze(document) {
 const checkpoint=document.revisions.at(-1);
 if(!checkpoint) return {rows:[],checkpoint:null,warnings:['Save a checkpoint to choose the text to analyse.']};
 if(checkpoint.capturePaused)return unknownResult(checkpoint,'This checkpoint was saved while recording was paused. Its complete edit history cannot be established.');
 const all=document.events||[];
 let cutoff=Number.isInteger(checkpoint.eventSequence)?all.findIndex(e=>e.sequence===checkpoint.eventSequence):-1;
 if(cutoff<0)cutoff=all.findIndex(e=>e.type==='checkpoint' && e.data.revisionId===checkpoint.id);
 if(cutoff<0) return unknownResult(checkpoint,'This checkpoint has no recorded event boundary. Its word histories and pauses are unknown.');
 const events=all.slice(0,cutoff+1), tracks=new Map(), operations=new Map(), snapshots=new Map(), inputs=[], warnings=new Set();
 let chars=[],live=[],nextId=1,clipboard=null,tombstone=null,segment=0,paused=false;
 const text=()=>chars.map(c=>c.value).join('');
 const newTrack=(source,parents=[])=>{const id=nextId++;tracks.set(id,{id,source,parents,ops:[]});return id;};
 function rebuild() {
  live=tokens(text()).map(t=>{let ids=union(chars.slice(t.start,t.end).map(c=>c.ids));if(!ids.length){const source=chars.slice(t.start,t.end).every(c=>c.source==='typed')?'typed':chars[t.start]?.source||'unknown';ids=[newTrack(source)];}for(let p=t.start;p<t.end;p++)chars[p].ids=ids;return {...t,ids};});
 }
 function reset(value,source){chars=value.split('').map(value=>({value,ids:[],birth:null,source}));live=tokens(value).map(t=>{const ids=[newTrack(source)];for(let p=t.start;p<t.end;p++)chars[p].ids=ids;return {...t,ids};});tombstone=null;}
 function rememberOp(ids,op){operations.set(op.id,op);for(const id of ids){const track=tracks.get(id);if(track && !track.ops.includes(op.id))track.ops.push(op.id);}}
 function historyIds(ids,seen=new Set()){const result=[];for(const id of ids){if(seen.has(id))continue;seen.add(id);const t=tracks.get(id);if(!t)continue;result.push(...historyIds(t.parents,seen),...t.ops);}return union([result]);}
 function histories(ids){return historyIds(ids).map(id=>operations.get(id)).filter(Boolean).sort((a,b)=>a.index-b.index);}
 for(let index=0;index<events.length;index++) {
  const e=events[index],d=e.data||{};
  if(e.type==='recording_paused')paused=true;
  if(e.type==='recording_resumed' && paused){
   for(const id of union(live.map(t=>t.ids)))tracks.get(id).source='unrecorded';
   warnings.add('Recording was paused. Histories for words present during that gap are incomplete, even if their visible text did not change.');paused=false;
  }
  if(['session_start','document_open','recording_resumed','recording_paused','revision_restore'].includes(e.type)){
   segment++;
   if(typeof d.text==='string' && d.text!==text()){
    if(e.type==='revision_restore' && snapshots.has(d.revisionId)){
     chars=structuredClone(snapshots.get(d.revisionId));rebuild();const op={id:e.id,index,kind:'restore',removed:'',inserted:'',timestamp:e.timestamp};rememberOp(union(live.map(t=>t.ids)),op);
    }else{reset(d.text,e.type==='recording_resumed'?'unrecorded':'pre-existing');if(e.type==='recording_resumed')warnings.add('Text changed while recording was paused; affected history is unknown.');}
   }
  }
  if(e.type==='checkpoint'){snapshots.set(d.revisionId,structuredClone(chars));}
  if(e.type==='copy' || e.type==='cut'){
   const start=d.selectionStart,end=d.selectionEnd;
   if(Number.isInteger(start)&&Number.isInteger(end)&&end>start){
    const frozen=new Map();
    const copied=chars.slice(start,end).map(c=>({...c,ids:c.ids.map(id=>{
     if(!frozen.has(id)){const original=tracks.get(id);const ancestorHistory=histories([id]);const unknown=hasUnknownAncestry(id);const frozenId=newTrack(unknown?'unknown':original.source);tracks.get(frozenId).ops=ancestorHistory.map(op=>op.id);frozen.set(id,frozenId);}
     return frozen.get(id);
    })}));
    clipboard={kind:e.type,text:text().slice(start,end),chars:copied,sourceStart:start,eventId:e.id};
   }
  }
  if(e.type!=='text_change')continue;
  const start=d.start,count=d.deleteCount,insert=d.insert;
  if(!Number.isInteger(start)||!Number.isInteger(count)||typeof insert!=='string'||start<0||count<0||start+count>chars.length){warnings.add('An invalid text patch was found; analysis cannot reconstruct this checkpoint.');return unknownResult(checkpoint,[...warnings].join(' '));}
  const removed=chars.slice(start,start+count),removedText=removed.map(c=>c.value).join('');
  const oldWords=live,oldLength=chars.length;
  let inherited=union(oldWords.filter(t=>count>0 && t.start<start+count && t.end>start).map(t=>t.ids));
  if(!count){const containing=oldWords.find(t=>t.start<start && t.end>start);if(containing)inherited=containing.ids;}
  const input={event:e,index,segment,previous:inputs.length?inputs.length-1:null,next:null};if(inputs.length)inputs.at(-1).next=inputs.length;const birth=inputs.length;inputs.push(input);
  let kind=count&&insert?'replace':count?'delete':'type';
  const paste=/Paste|Drop/.test(d.inputType||'');
  const typing=d.inputType==='insertText' && Array.from(insert).length===1;
  if(insert && !typing && !paste)kind='bulk';
  let added=insert.split('').map(value=>({value,ids:inherited,birth,source:typing?'typed':paste?'paste':'bulk'}));
  let sourcePosition=null;
  if(paste && clipboard && clipboard.text===insert){
   kind=clipboard.kind==='cut'?'move':'copy';sourcePosition=clipboard.sourceStart;
   const forks=new Map();
   added=clipboard.chars.map(c=>{const ids=c.ids.map(id=>{if(!forks.has(id))forks.set(id,newTrack(kind,[id]));return forks.get(id);});return {value:c.value,ids:union([ids,inherited]),birth,source:kind};});
   if(kind==='move')clipboard=null;
  }else if(paste){kind='paste';added=insert.split('').map(value=>({value,ids:inherited,birth,source:'paste'}));}
  // A word deleted completely and immediately retyped at the same seam retains its ancestry.
  if(!count && insert && !paste && !inherited.length && tombstone && tombstone.start===start && tombstone.segment===segment){added.forEach(c=>c.ids=tombstone.ids);inherited=tombstone.ids;}
  chars.splice(start,count,...added);rebuild();
  const touched=live.filter(t=>t.start<start+insert.length && t.end>start || count>0 && t.start<start && t.end>start || t.ids.some(id=>inherited.includes(id)) && t.text!==oldWords.find(old=>old.ids.includes(t.ids[0]))?.text);
  if(kind==='type' && insert){
   const revised=touched.some(t=>oldWords.some(old=>old.ids.some(id=>t.ids.includes(id)) && old.text!==t.text && (start<old.end || start===old.end && old.end<oldLength)));
   if(revised)kind='insert';
  }
  const affected=union([inherited,...touched.map(t=>t.ids)]);
  // Whitespace separators alone don't revise the words on either side.
  const op={id:e.id,index,kind,start,deleteCount:count,inputOrdinal:birth,removed:removedText,inserted:insert,timestamp:e.timestamp,sourcePosition,inputType:d.inputType||'unknown'};
  if(affected.length)rememberOp(affected,op);
  if(count && !insert && inherited.length)tombstone={start,ids:inherited,segment};
  else if(insert)tombstone=null;
 }
 if(text()!==checkpoint.text)return unknownResult(checkpoint,'The checkpoint differs from the recorded text (for example, recording was paused). Histories are unknown for this snapshot.');
 function pause(birth,side){
  if(birth===null || birth===undefined)return {ms:null,reason:'Letter predates the recorded input history.'};
  birth=inputs[birth];
  const otherIndex=side==='before'?birth.previous:birth.next;
  const other=otherIndex===null?null:inputs[otherIndex];
  if(!other){
   if(side==='before' && birth.event.data.synthetic && birth.event.data.scoreRun!==null && birth.event.data.scoreRun!==undefined)return {ms:birth.event.elapsedMs,reason:'Delay from the simulated writing-score session start to its first text input.'};
   return {ms:null,reason:side==='before'?'No previous text input was recorded.':'No subsequent text input before this checkpoint.'};
  }
  if(birth.event.data.scoreRun!==null && birth.event.data.scoreRun!==undefined && birth.event.sessionId===other.event.sessionId && birth.event.data.scoreRun===other.event.data.scoreRun)return {ms:null,reason:'The writing score gives no individual letter timing within this typing run.'};
  if(other.segment!==birth.segment || other.event.sessionId!==birth.event.sessionId)return {ms:null,reason:'The interval crosses a session or recording boundary.'};
  const ms=side==='before'?birth.event.elapsedMs-other.event.elapsedMs:other.event.elapsedMs-birth.event.elapsedMs;
  if(!Number.isFinite(ms)||ms<0)return {ms:null,reason:'A reliable monotonic interval is unavailable.'};
  return {ms,reason:'Interval between document text-input events; includes punctuation, spaces, and time spent elsewhere.'};
 }
 function hasUnknownAncestry(id,seen=new Set()) {if(seen.has(id))return false;seen.add(id);const track=tracks.get(id);return !track || ['unknown','pre-existing','unrecorded'].includes(track.source)||track.parents.some(parent=>hasUnknownAncestry(parent,seen));}
 const usage=new Map();for(const token of live)for(const id of token.ids)usage.set(id,(usage.get(id)||0)+1);
 const rows=live.map((t,i)=>{
  const letters=chars.slice(t.start,t.end),history=histories(t.ids);
  const sources=union(letters.map(c=>[c.source]));
  const ancestryUnknown=t.ids.some(id=>hasUnknownAncestry(id));
  const shared=t.ids.length>1 || t.ids.some(id=>usage.get(id)>1);
  const revisions=history.filter(op=>['insert','delete','replace','bulk','copy','move','paste','restore'].includes(op.kind)).length;
  const nonTyped=sources.some(s=>s!=='typed');
  const purity=ancestryUnknown?null:Math.max(0,Math.round(100/(1+revisions+(shared?1:0)+(nonTyped?1:0))));
  let before= pause(letters[0]?.birth,'before'),after=pause(letters.at(-1)?.birth,'after');
  if(nonTyped){before={ms:null,reason:'Not all letters were individually typed here (paste, move, bulk input, or pre-existing text).'};after={...before};}
  return {index:i+1,word:t.text,start:t.start,end:t.end,pauseBefore:before,pauseAfter:after,purity,history:compact(history),operations:history.map(({id,index,kind,start,deleteCount,removed,inserted,timestamp,sourcePosition,inputType})=>({id,index,kind,start,deleteCount,removed,inserted,timestamp,sourcePosition,inputType})),provenance:ancestryUnknown?'Incomplete':shared?'Shared word lineage':nonTyped?'Transferred / bulk input':'Recorded typing',shared};
 });
 return {version:1,checkpoint:{id:checkpoint.id,title:checkpoint.title,date:checkpoint.date,eventSequence:events.at(-1)?.sequence},rows,warnings:[...warnings]};
}
function compact(ops){const parts=[];for(const op of ops){const last=parts.at(-1);if(op.kind==='type' && last?.kind==='type' && op.start===last.start+last.inserted.length && op.inputOrdinal===last.lastOrdinal+1){last.inserted+=op.inserted;last.lastOrdinal=op.inputOrdinal;continue;}parts.push({...op,lastOrdinal:op.inputOrdinal});}return parts.map(op=>{const q=v=>JSON.stringify(v);switch(op.kind){case 'type':return 'T'+q(op.inserted);case 'insert':return 'I'+q(op.inserted);case 'delete':return 'D'+q(op.removed);case 'replace':return 'R'+q(op.removed)+'→'+q(op.inserted);case 'copy':return 'C←@'+op.sourcePosition+' '+q(op.inserted);case 'move':return 'M←@'+op.sourcePosition+' '+q(op.inserted);case 'paste':return 'P'+q(op.inserted);case 'restore':return 'Restore';default:return 'B'+q(op.inserted);}}).join(' · ');}
function unknownResult(checkpoint,message){return {version:1,checkpoint:{id:checkpoint.id,title:checkpoint.title,date:checkpoint.date},warnings:[message],rows:tokens(checkpoint.text).map((t,i)=>({index:i+1,word:t.text,start:t.start,end:t.end,pauseBefore:{ms:null,reason:message},pauseAfter:{ms:null,reason:message},purity:null,history:'Unknown',operations:[],provenance:'Incomplete',shared:false}))};}
root.MarginWordAnalysis={analyze,tokens};
if(typeof module!=='undefined')module.exports=root.MarginWordAnalysis;
})(typeof globalThis!=='undefined'?globalThis:window);
