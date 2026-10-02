/* Writing-score import/export and deterministic synthetic sessions. No DOM dependencies. */
(function(root){
'use strict';
const LIMIT=100000,MAX_SOURCE=2000000;
const sample=`<2.329>Hell<0.802>o this dis<0.935><DEL3><0.681>is a <0.778>simple<0.445> <0.717>e<0.312>x<0.323>ample<1.429>.<0.404><ENTER><0.88>Thi<0.31>s <0.61>only <0.913>cont<1.372><DEL><0.358>sis<0.358>t<1.525>s o<0.492><DEL>o<0.342>f a <1.257>fe<0.333>w<0.891> edi<0.438>t<0.32>s<3.21> an<0.646>dd<0.71><DEL><0.477> <4.821>n<0.304>o<0.446>t <0.373>ve<1.345>r<DEL3>very yma<0.349>y <1.252><DEL><0.345><DEL4><0.706>man<0.36>y<0.723> com<0.328>pe<0.473>x<DEL6>complex <0.802>edit<0.339>s<2.396>.<ENTER><ENTER><2.269><DEL><0.748>I<0.323>t <0.728>shoudl<0.309><DEL6>should <1.143>s<0.507>till<0.344> <0.325>be <0.712>en<0.311>ou<1.948>gh to<0.611> <0.326>ill<0.596>ustrate <0.9>the <0.663>con<0.331>cept<0.61> <0.414>o<0.335>f <1.206>writigb<0.375><DEL7>writing <0.965>s<0.369>co<0.315>re<0.671><ENTER><1.356><CLICK1><1.372><CLICK31><1.432><CLICK15><2.225><CLICK23><1.156><DEL6><1.125>h<0.332>o<0.321>rt<1.283> <1.317><CLICK1><1.066><CLICK7><1.097><DEL5><0.674><DEL><0.484><DEL><1.058>T<1.077><CLICK0><1.025><ENTER><ENTER><0.752><CLICK0><1.208>Wr<0.303>iti<0.319>ng<0.485> <0.605>s<0.329>core<1.328><CLICK176><5.559><CLICK175><0.948>.<ENTER><10.472><CLICK137><2.282><CLICK74><1.282><DEL9><0.967><DEL><1.738>s<0.337>i<0.436>m<0.519>ple<0.414> <0.82>te<0.32>x<0.337>t<1.1> <13.162><CLICK164><1.196>the <1.385><CLICK183><5.824>`;
const sampleText='Writing score\n\nThis is a short example.\nThis only consists of a simple text and not very many complex edits.\nIt should still be enough to illustrate the concept of the writing score.\n\n';
function encode(value){const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode(value){try{if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error();const binary=atob(value.replaceAll('-','+').replaceAll('_','/'));return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));}catch{throw Error('Invalid encoded score payload.');}}
const payload=(name,value)=>'<'+name+':'+encode(value)+'>';
// Replace both angle brackets in one pass, so generated control brackets are not escaped again.
const escapeText=value=>value.replace(/[<>\n\t]/g,c=>({'<':'<LT>','>':'<GT>','\n':'<ENTER>','\t':'<TAB>'}[c]));
function parse(source,options={}){
 if(typeof source!=='string'||source.length>MAX_SOURCE)throw Error('Score must be text of at most 2 MB.');
 const startTime=options.startTime||'2026-01-01T00:00:00.000Z',base=Date.parse(startTime);
 if(!Number.isFinite(base))throw Error('Invalid start timestamp.');
 const id=options.idFactory||(()=>crypto.randomUUID()),sessionId=id(),events=[],warnings=new Set();
 let text='',start=0,end=0,elapsed=0,clipboard='',run=0,offset=0,rich=null;
 function emit(type,data={}){if(events.length>=LIMIT)throw Error('Score exceeds the 100,000 event limit.');const e={id:id(),sequence:events.length+1,sessionId,timestamp:new Date(base+elapsed).toISOString(),elapsedMs:elapsed,type,data:{...data,synthetic:true,scoreDerived:true}};events.push(e);return e;}
 function point(position){if(!Number.isSafeInteger(position)||position<0||position>text.length)throw Error('Cursor position '+position+' is outside the current text (length '+text.length+').');if(position>0&&position<text.length&&/[\uD800-\uDBFF]/.test(text[position-1])&&/[\uDC00-\uDFFF]/.test(text[position]))throw Error('A cursor position splits a Unicode surrogate pair.');}
 function select(a,b){point(a);point(b);if(a>b)throw Error('Selection start must precede its end.');start=a;end=b;emit('selection',{start:a,end:b,direction:'forward'});}
 function patch(a,count,insert,inputType,timingRun=null){point(a);point(a+count);if(typeof insert!=='string')throw Error('Inserted text must be a string.');emit('before_input',{inputType,data:insert||null,selectionStart:a,selectionEnd:a+count,isComposing:false});text=text.slice(0,a)+insert+text.slice(a+count);start=end=a+insert.length;emit('text_change',{start:a,deleteCount:count,insert,inputType,selectionStart:start,selectionEnd:end,scoreRun:timingRun});}
 function type(value){const timingRun=++run;for(const c of value)patch(start,end-start,c,c==='\n'?'insertLineBreak':'insertText',timingRun);}
 function remove(count,forward=false){if(start!==end){patch(start,end-start,'',forward?'deleteContentForward':'deleteContentBackward');return;}const available=forward?text.length-end:start;if(count>available)warnings.add('A delete ran past the text boundary and was limited to the available characters.');count=Math.min(count,available);if(count)patch(forward?start:start-count,count,'',forward?'deleteContentForward':'deleteContentBackward');}
 emit('session_start',{text:'',title:options.title||'Writing score',source:'writing-score'});
 const chunks=source.matchAll(/<[^<>]*>|[^<]+|</g);
 for(const match of chunks){offset=match.index;const raw=match[0];
  if(raw==='<')throw Error('Unclosed or nested token at character '+offset+'. Use <LT> for a literal <.');
  if(!raw.startsWith('<')){emit('score_token',{raw,offset});type(raw);continue;}
  const token=raw.slice(1,-1);
  if(token.startsWith('RICH:')){if(rich)throw Error('Only one lossless archive is allowed.');rich=decode(token.slice(5));continue;}
  if(/^\d+(?:\.\d+)?$/.test(token)){const ms=Number(token)*1000;if(!Number.isFinite(ms)||ms>31536000000)throw Error('Pause is outside the supported range at character '+offset+'.');if(Math.abs(ms-Math.round(ms))>0.000001)warnings.add('Pauses finer than one millisecond were rounded in the rich log; original tokens are retained.');elapsed+=Math.round(ms);if(elapsed>31536000000)throw Error('Session exceeds one year.');emit('score_token',{raw,offset,pauseMs:ms});continue;}
  if(/^-\d|^NaN$|^Infinity$/.test(token))throw Error('Invalid pause at character '+offset+'.');
  emit('score_token',{raw,offset});
  if(token==='ENTER'){type('\n');continue;}
  if(token==='TAB'){type('\t');continue;}
  if(token==='LT'||token==='GT'){type(token==='LT'?'<':'>');continue;}
  let m;
  if((m=/^(DEL|FWD)(\d*)$/.exec(token))){const count=Number(m[2]||1);if(!Number.isSafeInteger(count)||count<1)throw Error('Delete count must be a positive integer.');remove(count,m[1]==='FWD');continue;}
  if((m=/^CLICK(\d+)$/.exec(token))){select(Number(m[1]),Number(m[1]));continue;}
  if((m=/^SELECT(\d+):(\d+)$/.exec(token))){select(Number(m[1]),Number(m[2]));continue;}
  if(token==='COPY'||token==='CUT'){clipboard=text.slice(start,end);emit(token.toLowerCase(),{selectionStart:start,selectionEnd:end,selectedText:clipboard});if(token==='CUT' && start!==end)patch(start,end-start,'','deleteByCut');continue;}
  if(token==='PASTE'){emit('paste',{selectionStart:start,selectionEnd:end});patch(start,end-start,clipboard,'insertFromPaste');continue;}
  if((m=/^(TEXT|PASTE|BASE|PATCH|CLIP):(.+)$/.exec(token))){const value=decode(m[2]);
   if(m[1]==='TEXT'){if(typeof value!=='string')throw Error('TEXT payload must be a string.');type(value);}
   if(m[1]==='PASTE'){if(typeof value!=='string')throw Error('PASTE payload must be a string.');emit('paste',{selectionStart:start,selectionEnd:end});patch(start,end-start,value,'insertFromPaste');}
   if(m[1]==='BASE'){if(typeof value!=='string')throw Error('BASE payload must be a string.');text=value;start=end=value.length;emit('document_open',{text:value,source:'score-snapshot'});}
   if(m[1]==='PATCH'){if(!value||!Number.isInteger(value.start)||!Number.isInteger(value.deleteCount)||value.deleteCount<0||typeof value.insert!=='string')throw Error('Invalid PATCH payload.');patch(value.start,value.deleteCount,value.insert,value.inputType||'insertReplacementText');}
   if(m[1]==='CLIP'){if(!value||!['copy','cut'].includes(value.kind))throw Error('Invalid CLIP payload.');select(value.start,value.end);clipboard=text.slice(start,end);emit(value.kind,{selectionStart:start,selectionEnd:end,selectedText:clipboard});}
   continue;
  }
  if(/^(CLICK|SELECT|DEL|FWD)/.test(token))throw Error('Malformed cursor or delete token '+raw+' at character '+offset+'.');
  warnings.add('Unsupported token '+raw+' was retained in the log but has no simulated effect.');emit('score_unknown',{raw,offset});
 }
 if(rich){
  if(rich.version!==1||!rich.document||typeof rich.document.text!=='string'||!Array.isArray(rich.document.events)||rich.document.events.length>LIMIT||!Array.isArray(rich.document.comments)||!Array.isArray(rich.document.revisions)||rich.document.comments.some(c=>!c||typeof c!=='object')||rich.document.revisions.some(r=>!r||typeof r.id!=='string'||typeof r.text!=='string'||typeof r.title!=='string'))throw Error('Invalid lossless document archive.');
  validateEvents(rich.document.events);
  if(text!==rich.document.text)throw Error('The compact score and lossless archive disagree about the final text.');
  return {text:rich.document.text,cursor:start,elapsedMs:elapsed,events:structuredClone(rich.document.events),warnings:[...warnings],document:structuredClone(rich.document),lossless:true};
 }
 return {text,cursor:start,elapsedMs:elapsed,events,warnings:[...warnings],lossless:false};
}
function validateEvents(events){const ids=new Set();for(const e of events){if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.sessionId!=='string'||typeof e.type!=='string'||!Number.isInteger(e.sequence)||!Number.isFinite(e.elapsedMs)||e.elapsedMs<0||!Number.isFinite(Date.parse(e.timestamp))||!e.data||typeof e.data!=='object'||Array.isArray(e.data)&&e.data.length>0)throw Error('Invalid event in lossless archive.');ids.add(e.id);}}
function exportExtended(document,options={}){
 const events=document.events||[];validateEvents(events);
 const out=[],warnings=new Set();let text='',start=0,end=0,last=null;
 function wait(e){let ms=0;if(last){ms=last.sessionId===e.sessionId?e.elapsedMs-last.elapsedMs:Date.parse(e.timestamp)-Date.parse(last.timestamp);if(ms<0){warnings.add('A clock moved backwards; that compact pause was set to zero.');ms=0;}}else ms=e.elapsedMs;if(ms>0)out.push('<'+String(Math.round(ms*1000000)/1000000000)+'>');last=e;}
 function click(position){if(start!==position||end!==position){out.push('<CLICK'+position+'>');start=end=position;}}
 for(const e of events){const d=e.data||{};
  if(e.type==='score_token'){out.push(d.raw);last=e;continue;}
  if(d.scoreDerived){
   if(e.type==='text_change'){text=text.slice(0,d.start)+d.insert+text.slice(d.start+d.deleteCount);start=end=d.start+d.insert.length;}
   if(e.type==='selection'){start=d.start;end=d.end;}
   if(['session_start','document_open'].includes(e.type)&&typeof d.text==='string'){text=d.text;start=end=text.length;}
   continue;
  }
  if(e.type==='text_change'){
   if(!Number.isInteger(d.start)||!Number.isInteger(d.deleteCount)||d.start<0||d.deleteCount<0||d.start+d.deleteCount>text.length||typeof d.insert!=='string')throw Error('Cannot export an invalid text patch.');
   wait(e);
   const typed=d.inputType==='insertText'&&Array.from(d.insert).length===1&&!d.deleteCount;
   const deletion=!d.insert&&d.deleteCount>0;
   if(typed){click(d.start);out.push(escapeText(d.insert));}
   else if(deletion){click(d.start+d.deleteCount);out.push('<DEL'+(d.deleteCount===1?'':d.deleteCount)+'>');}
   else{out.push(payload('PATCH',{start:d.start,deleteCount:d.deleteCount,insert:d.insert,inputType:d.inputType||'insertReplacementText'}));}
   text=text.slice(0,d.start)+d.insert+text.slice(d.start+d.deleteCount);start=end=d.start+d.insert.length;continue;
  }
  if(e.type==='selection'){wait(e);if(d.start===d.end){out.push('<CLICK'+d.start+'>');}else{out.push('<SELECT'+d.start+':'+d.end+'>');}start=d.start;end=d.end;continue;}
  if(e.type==='copy'||e.type==='cut'){wait(e);out.push(payload('CLIP',{kind:e.type,start:d.selectionStart,end:d.selectionEnd}));start=d.selectionStart;end=d.selectionEnd;continue;}
  if(['session_start','document_open','recording_resumed','recording_paused','revision_restore','checkpoint'].includes(e.type)&&typeof d.text==='string'){
   // Preserve recorded snapshot boundaries as snapshots, never pretend the contents were typed.
   if(d.text!==text){wait(e);out.push(payload('BASE',d.text));text=d.text;start=end=text.length;}
   else if(e.type==='session_start' && !last)last=e;
   continue;
  }
  // Other events are retained by the optional archive, not fabricated as score actions.
  if(!['before_input','keydown','keyup','paste','score_unknown'].includes(e.type))warnings.add('Compact export omits non-text events and their metadata. Use the lossless archive to retain the complete document log.');
 }
 // Imported score markers are the source of truth for their derived text/cursor state.
 if(events.some(e=>e.type==='score_token')){
  const projected=parse(out.join(''));
  text=projected.text;start=projected.cursor;
 }
 if(text!==document.text){out.push(payload('BASE',document.text));warnings.add('Final text needed a snapshot (some changes were not recorded).');}
 if(options.lossless)out.push(payload('RICH',{version:1,document}));
 const score=out.join('');if(score.length>MAX_SOURCE)throw Error('This score exceeds the 2 MB import limit. Try compact export, or use Export JSON in Writing process for the full log.');
 return {score,warnings:[...warnings],lossless:!!options.lossless};
}
// Lower semantic edits to the original notation. Selections and clipboard operations
// become explicit cursor moves, backward deletions, and literal insertions.
function toPortable(source){
 const parsed=parse(source),warnings=new Set(parsed.warnings);
 if(parsed.lossless)throw Error('A lossless archive is not a portable score. Export without the archive to make a basic score.');
 const basic=/^(?:\d+(?:\.\d+)?|ENTER|DEL\d*|CLICK\d+)$/;
 const tokens=Array.from(source.matchAll(/<([^<>]*)>/g));
 if(tokens.every(m=>basic.test(m[1])))return {score:source,warnings:[...warnings],portable:true};
 const out=[];let text='',cursor=0,lastMs=0;
 function wait(e){const delta=e.elapsedMs-lastMs;if(delta>0)out.push('<'+String(delta/1000)+'>');lastMs=e.elapsedMs;}
 function click(position){if(cursor!==position){out.push('<CLICK'+position+'>');cursor=position;}}
 function insert(value){if(/[<>]/.test(value))throw Error('Basic notation cannot safely encode literal angle brackets. Choose extended notation for this text.');out.push(value.replaceAll('\n','<ENTER>'));cursor+=value.length;}
 function patch(start,count,value){click(start+count);if(count){out.push('<DEL'+(count===1?'':count)+'>');cursor-=count;}insert(value);text=text.slice(0,start)+value+text.slice(start+count);}
 for(const e of parsed.events){const d=e.data;
  if(e.type==='score_token' && d.pauseMs!==undefined){out.push(d.raw);lastMs=e.elapsedMs;continue;}
  if(e.type==='selection'){wait(e);click(d.end);continue;}
  if(e.type==='text_change'){wait(e);patch(d.start,d.deleteCount,d.insert);continue;}
  if(e.type==='document_open' && typeof d.text==='string'){wait(e);patch(0,text.length,d.text);warnings.add('Basic notation represents snapshots as inserted text; use extended notation or the archive to retain their provenance.');}
  if(e.type==='score_unknown')warnings.add('Unsupported tokens were omitted from portable output.');
  if(['copy','cut','paste'].includes(e.type))warnings.add('Basic notation expands clipboard edits into deletions and typed text; clipboard and selection metadata require extended notation or the archive.');
 }
 if(text!==parsed.text)throw Error('Portable conversion failed to reconstruct the original text.');
 const score=out.join('');if(score.length>MAX_SOURCE)throw Error('Portable score exceeds the 2 MB limit.');
 if(parse(score).text!==parsed.text)throw Error('Portable score failed validation.');
 return {score,warnings:[...warnings],portable:true};
}
function exportScore(document,options={}){
 const extended=exportExtended(document,options);
 if(options.extended||options.lossless)return {...extended,portable:false};
 const portable=toPortable(extended.score);
 return {...portable,warnings:[...new Set([...extended.warnings,...portable.warnings])],lossless:false};
}
function generate(target,options={}){
 if(typeof target!=='string'||!target.length||target.length>5000)throw Error('Target text must contain 1–5,000 characters.');
 const seed=String(options.seed??'margin-1');let randomState=2166136261;for(const c of seed){randomState^=c.charCodeAt(0);randomState=Math.imul(randomState,16777619);}const random=()=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return (randomState>>>0)/4294967296;};
 const edits=Number(options.edits??5);if(!Number.isInteger(edits)||edits<0||edits>50)throw Error('Edit passes must be an integer from 0 to 50.');
 const score=[];let text='',cursor=0,selectionEnd=0,clipboard='';
 const pause=()=>score.push('<'+(0.08+random()*1.6).toFixed(3)+'>');
 const select=(a,b=a)=>{pause();score.push(a===b?'<CLICK'+a+'>':'<SELECT'+a+':'+b+'>');cursor=a;selectionEnd=b;};
 const type=value=>{for(const c of value){pause();score.push(escapeText(c));text=text.slice(0,cursor)+c+text.slice(selectionEnd);cursor+=c.length;selectionEnd=cursor;}};
 const del=()=>{pause();score.push('<DEL>');const from=cursor===selectionEnd?Math.max(0,cursor-1):cursor;text=text.slice(0,from)+text.slice(selectionEnd);cursor=selectionEnd=from;};
 const copy=()=>{pause();score.push('<COPY>');clipboard=text.slice(cursor,selectionEnd);};
 const cut=()=>{pause();score.push('<CUT>');clipboard=text.slice(cursor,selectionEnd);text=text.slice(0,cursor)+text.slice(selectionEnd);selectionEnd=cursor;};
 const paste=()=>{pause();score.push('<PASTE>');text=text.slice(0,cursor)+clipboard+text.slice(selectionEnd);cursor+=clipboard.length;selectionEnd=cursor;};
 type(target);
 const words=Array.from(target.matchAll(/[\p{L}\p{N}]+/gu),m=>({start:m.index,end:m.index+m[0].length,text:m[0]}));
 for(let i=0;i<edits&&words.length;i++){
  const word=words[Math.floor(random()*words.length)];
  select(word.end);type('x');del(); // A temporary suffix and correction.
  if(i%3===0){ // Move an original word out and back, retaining a surviving move history.
   select(word.start,word.end);cut();const destination=text.length;select(destination);paste();select(destination,destination+word.text.length);cut();select(word.start);paste();
  }
  if(i%3===1){ // Copy a word, then remove the temporary duplicate.
   select(word.start,word.end);copy();select(text.length);type(' ');const duplicateStart=text.length;paste();select(duplicateStart,text.length);del();select(text.length);del();
  }
 }
 pause();
 if(text!==target)throw Error('Generator did not reconstruct its target.');
 const generated=score.join(''),result=parse(generated);
 if(result.text!==target)throw Error('Generated score failed validation.');
 const output=options.extended?{score:generated,warnings:[]}:toPortable(generated);
 return {...output,expectedText:target,seed,edits,durationMs:result.elapsedMs,extended:!!options.extended};
}
root.MarginWritingScore={parse,exportScore,generate,toPortable,encode,payload,sample,sampleText};
if(typeof module!=='undefined')module.exports=root.MarginWritingScore;
})(typeof globalThis!=='undefined'?globalThis:window);
