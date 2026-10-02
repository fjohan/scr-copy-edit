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
 const webscriptlog=options.format==='webscriptlog';
 const id=options.idFactory||(()=>crypto.randomUUID()),sessionId=id(),events=[],warnings=new Set();
 let text='',start=0,end=0,direction='forward',elapsed=0,clipboard='',run=0,offset=0,rich=null,clipboardCommand=null;
 function emit(type,data={}){if(events.length>=LIMIT)throw Error('Score exceeds the 100,000 event limit.');const e={id:id(),sequence:events.length+1,sessionId,timestamp:new Date(base+elapsed).toISOString(),elapsedMs:elapsed,type,data:{...data,synthetic:true,scoreDerived:true,scoreFormat:webscriptlog?'webscriptlog':'margin'}};events.push(e);return e;}
 function point(position){if(!Number.isSafeInteger(position)||position<0||position>text.length)throw Error('Cursor position '+position+' is outside the current text (length '+text.length+').');if(!webscriptlog&&position>0&&position<text.length&&/[\uD800-\uDBFF]/.test(text[position-1])&&/[\uDC00-\uDFFF]/.test(text[position]))throw Error('A cursor position splits a Unicode surrogate pair.');}
 function select(a,b,backward=false,source='unknown'){clipboardCommand=null;point(a);point(b);if(a>b)throw Error('Selection start must precede its end.');start=a;end=b;direction=backward?'backward':'forward';emit('selection',{start:a,end:b,direction,source});}
 function navigate(action,a,b,backward,modifiers=[]){
  if(a===undefined){
   const shift=modifiers.includes('SHIFT'),anchor=direction==='backward'?end:start,focus=direction==='backward'?start:end;
   let target=focus;
   const previous=p=>p>1&&/[\uDC00-\uDFFF]/.test(text[p-1])&&/[\uD800-\uDBFF]/.test(text[p-2])?p-2:Math.max(0,p-1);
   const next=p=>p+1<text.length&&/[\uD800-\uDBFF]/.test(text[p])&&/[\uDC00-\uDFFF]/.test(text[p+1])?p+2:Math.min(text.length,p+1);
   const lineStart=p=>p===0?0:text.lastIndexOf('\n',p-1)+1,lineEnd=p=>{const n=text.indexOf('\n',p);return n<0?text.length:n;};
   if(action==='ALL'){a=0;b=text.length;backward=false;}
   else if(['LEFT_TO_START','UP_TO_START'].includes(action)){a=b=0;backward=false;}
   else if(['RIGHT_TO_END','DOWN_TO_END'].includes(action)){a=b=text.length;backward=false;}
   else if(modifiers.some(m=>m!=='SHIFT')&&!['HOME','END'].includes(action))throw Error('Modified navigation needs a recorded target, e.g. <CTRL+LEFT@0:0>.');
   if(action==='LEFT')target=!shift&&start!==end?start:previous(focus);
   else if(action==='RIGHT')target=!shift&&start!==end?end:next(focus);
   else if(action==='HOME')target=modifiers.includes('CTRL')||modifiers.includes('META')?0:lineStart(focus);
   else if(action==='END')target=modifiers.includes('CTRL')||modifiers.includes('META')?text.length:lineEnd(focus);
   else if(action==='UP'){const from=lineStart(focus),column=focus-from;target=from===0?0:Math.min(lineStart(from-1)+column,from-1);}
   else if(action==='DOWN'){const to=lineEnd(focus),column=focus-lineStart(focus);target=to===text.length?text.length:Math.min(to+1+column,lineEnd(to+1));}
   else if(!['ALL','LEFT_TO_START','UP_TO_START','RIGHT_TO_END','DOWN_TO_END'].includes(action))throw Error('Page navigation needs a recorded target.');
   if(!['ALL','LEFT_TO_START','UP_TO_START','RIGHT_TO_END','DOWN_TO_END'].includes(action)){if(target>0&&target<text.length&&/[\uD800-\uDBFF]/.test(text[target-1])&&/[\uDC00-\uDFFF]/.test(text[target]))target--;a=shift?Math.min(anchor,target):target;b=shift?Math.max(anchor,target):target;backward=shift&&target<anchor;}
  }
  point(a);point(b);if(a>b)throw Error('Navigation selection start must precede its end.');
  emit('navigation',{source:'keyboard',action,modifiers,start:a,end:b,direction:backward?'backward':'forward'});
  select(a,b,backward,'keyboard');
 }
 function patch(a,count,insert,inputType,timingRun=null){point(a);point(a+count);if(typeof insert!=='string')throw Error('Inserted text must be a string.');emit('before_input',{inputType,data:insert||null,selectionStart:a,selectionEnd:a+count,isComposing:false});text=text.slice(0,a)+insert+text.slice(a+count);start=end=a+insert.length;emit('text_change',{start:a,deleteCount:count,insert,inputType,selectionStart:start,selectionEnd:end,scoreRun:timingRun});}
 function type(value){if(webscriptlog&&clipboardCommand==='PASTE'){patch(start,end-start,value,'insertFromPaste');return;}const timingRun=++run;for(const c of value)patch(start,end-start,c,c==='\n'?'insertLineBreak':'insertText',timingRun);}
 function remove(count,forward=false){const inputType=webscriptlog&&clipboardCommand==='CUT'?'deleteByCut':forward?'deleteContentForward':'deleteContentBackward';if(start!==end){patch(start,end-start,'',inputType);return;}const available=forward?text.length-end:start;if(count>available)warnings.add('A delete ran past the text boundary and was limited to the available characters.');count=Math.min(count,available);if(count)patch(forward?start:start-count,count,'',inputType);}
 emit('session_start',{text:'',title:options.title||'Writing score',source:'writing-score'});
 const chunks=source.matchAll(/<[^<>]*>|[^<]+|</g);
 for(const match of chunks){offset=match.index;const raw=match[0];
  if(raw==='<')throw Error('Unclosed or nested token at character '+offset+'. Use <LT> for a literal <.');
  if(!raw.startsWith('<')){emit('score_token',{raw,offset});type(raw);continue;}
  const token=raw.slice(1,-1);
  if(!webscriptlog&&token.startsWith('RICH:')){if(rich)throw Error('Only one lossless archive is allowed.');rich=decode(token.slice(5));continue;}
  if(/^\d+(?:\.\d+)?$/.test(token)&&(!webscriptlog||/^\d+(?:\.\d{1,3})?$/.test(token))){const ms=Number(token)*1000;if(!Number.isFinite(ms)||ms>31536000000)throw Error('Pause is outside the supported range at character '+offset+'.');if(Math.abs(ms-Math.round(ms))>0.000001)warnings.add('Pauses finer than one millisecond were rounded in the rich log; original tokens are retained.');clipboardCommand=null;elapsed+=Math.round(ms);if(elapsed>31536000000)throw Error('Session exceeds one year.');emit('score_token',{raw,offset,pauseMs:ms});continue;}
  if(!webscriptlog&&/^-\d|^NaN$|^Infinity$/.test(token))throw Error('Invalid pause at character '+offset+'.');
  emit('score_token',{raw,offset});
  if(webscriptlog){
   let w;
   if((w=/^(NAV\d+|SEL\d+:\d+)$/.exec(token))){const positions=token.slice(3).split(':').map(Number),a=positions[0],b=positions[1]??a;select(Math.min(a,b),Math.max(a,b),a>b);continue;}
   if((w=/^(DEL|FDEL)(\d*)$/.exec(token))){const count=Number(w[2]||1);if(!Number.isSafeInteger(count)||count<1)throw Error('Delete count must be a positive integer.');const available=text.length+1;for(let n=0;n<Math.min(count,available);n++)remove(1,w[1]==='FDEL');continue;}
   if((w=/^(LEFT|RIGHT|UP|DOWN|SLEFT|SRIGHT|SUP|SDOWN)(\d*)$/.exec(token))){const count=Number(w[2]||1);if(!Number.isSafeInteger(count)||count<1)throw Error('Navigation count must be positive.');const shift=w[1].startsWith('S'),action=shift?w[1].slice(1):w[1],anchor=direction==='backward'?end:start,focus=direction==='backward'?start:end;let target=focus;
    if(action==='LEFT')target=shift?Math.max(0,focus-count):start!==end?Math.max(0,start-count+1):Math.max(0,start-count);
    if(action==='RIGHT')target=shift?Math.min(text.length,focus+count):start!==end?Math.min(text.length,end+count-1):Math.min(text.length,end+count);
    if(!shift&&(action==='UP'||action==='DOWN'))navigate(action,start,end,direction==='backward');else navigate(action,shift?Math.min(anchor,target):target,shift?Math.max(anchor,target):target,shift&&target<anchor,shift?['SHIFT']:[]);continue;
   }
   if(['HOME','END','LEFT_TO_START','RIGHT_TO_END','UP_TO_START','DOWN_TO_END'].includes(token)){const target=['HOME','LEFT_TO_START','UP_TO_START'].includes(token)?0:text.length;navigate(token,target,target,false);continue;}
   if((w=/^BDEL(\d+):(\d+)$/.exec(token))){const cursor=end,a=Math.max(0,cursor-Number(w[1])),b=Math.min(text.length,cursor+Number(w[2]));patch(a,b-a,'','deleteSurroundingText');continue;}
   if(['COPY','CUT','PASTE'].includes(token)){clipboardCommand=token;emit(token.toLowerCase(),{selectionStart:start,selectionEnd:end,selectedText:text.slice(start,end),markerOnly:true});continue;}
   if(token==='SELECTALL'||/^(UNDO|REDO)(\d*|\*)$/.test(token)||token.startsWith('KEY:')){clipboardCommand=null;emit('score_marker',{command:token,selectionStart:start,selectionEnd:end});continue;}
   if(token==='ENTER'){type('\n');continue;}
   if(token==='LT'||token==='GT'){type(token==='LT'?'<':'>');continue;}
   if(!/^CLICK\d+$/.test(token)){warnings.add('WebScriptLog treats unrecognised tokens as literal text: '+raw);type(raw);continue;}
  }
  if(token==='ENTER'){type('\n');continue;}
  if(token==='TAB'){type('\t');continue;}
  if(token==='LT'||token==='GT'){type(token==='LT'?'<':'>');continue;}
  let m;
  if(token.startsWith('KEY:')){emit('score_marker',{command:token.slice(4),selectionStart:start,selectionEnd:end});continue;}
  if((m=/^(DEL|FWD)(\d*)$/.exec(token))){const count=Number(m[2]||1);if(!Number.isSafeInteger(count)||count<1)throw Error('Delete count must be a positive integer.');remove(count,m[1]==='FWD');continue;}
  if((m=/^(CLICK|TAP)(\d+)(?::(\d+))?(?::(B))?$/.exec(token))){const a=Number(m[2]),b=m[3]===undefined?a:Number(m[3]);point(a);point(b);if(a>b)throw Error('Selection start must precede its end.');emit('navigation',{source:m[1]==='TAP'?'touch':'pointer',start:a,end:b,direction:m[4]?'backward':'forward'});select(a,b,!!m[4],m[1]==='TAP'?'touch':'pointer');continue;}
  if((m=/^MOVE(\d+)$/.exec(token))){select(Number(m[1]),Number(m[1]));continue;}
  if((m=/^SELECT(\d+):(\d+)(?::(B))?$/.exec(token))){select(Number(m[1]),Number(m[2]),!!m[3]);continue;}
  if((m=/^((?:(?:SHIFT|CTRL|META|ALT)\+)*)(LEFT_TO_START|RIGHT_TO_END|UP_TO_START|DOWN_TO_END|LEFT|RIGHT|UP|DOWN|HOME|END|PAGEUP|PAGEDOWN|ALL)(?:@(\d+):(\d+)(?::(B))?)?$/.exec(token))){navigate(m[2],m[3]===undefined?undefined:Number(m[3]),m[4]===undefined?undefined:Number(m[4]),!!m[5],m[1].split('+').filter(Boolean));continue;}
  if(token==='COPY'||token==='CUT'){clipboard=text.slice(start,end);emit(token.toLowerCase(),{selectionStart:start,selectionEnd:end,selectedText:clipboard});if(token==='CUT' && start!==end)patch(start,end-start,'','deleteByCut');continue;}
  if(token==='PASTE'){emit('paste',{selectionStart:start,selectionEnd:end});patch(start,end-start,clipboard,'insertFromPaste');continue;}
  if((m=/^(TEXT|PASTE|BASE|PATCH|CLIP|CUT):(.+)$/.exec(token))){const value=decode(m[2]);
   if(m[1]==='TEXT'){if(typeof value!=='string')throw Error('TEXT payload must be a string.');type(value);}
   if(m[1]==='PASTE'){if(typeof value!=='string')throw Error('PASTE payload must be a string.');emit('paste',{selectionStart:start,selectionEnd:end});patch(start,end-start,value,'insertFromPaste');}
   if(m[1]==='BASE'){if(typeof value!=='string')throw Error('BASE payload must be a string.');text=value;start=end=value.length;emit('document_open',{text:value,source:'score-snapshot'});}
   if(m[1]==='PATCH'){if(!value||!Number.isInteger(value.start)||!Number.isInteger(value.deleteCount)||value.deleteCount<0||typeof value.insert!=='string')throw Error('Invalid PATCH payload.');patch(value.start,value.deleteCount,value.insert,value.inputType||'insertReplacementText');}
   if(m[1]==='CLIP'){if(!value||!['copy','cut'].includes(value.kind))throw Error('Invalid CLIP payload.');select(value.start,value.end);clipboard=text.slice(start,end);emit(value.kind,{selectionStart:start,selectionEnd:end,selectedText:clipboard});}
   if(m[1]==='CUT'){if(!value)throw Error('Invalid CUT payload.');select(value.start,value.end);clipboard=text.slice(start,end);emit('cut',{selectionStart:start,selectionEnd:end,selectedText:clipboard});if(start!==end)patch(start,end-start,'','deleteByCut');}
   continue;
  }
  if(/^(CLICK|TAP|MOVE|SELECT|DEL|FWD|LEFT|RIGHT|UP|DOWN|HOME|END|PAGEUP|PAGEDOWN|ALL|SHIFT\+|CTRL\+|META\+|ALT\+)/.test(token))throw Error('Malformed cursor or delete token '+raw+' at character '+offset+'.');
  warnings.add('Unsupported token '+raw+' was retained in the log but has no simulated effect.');emit('score_unknown',{raw,offset});
 }
 if(rich){
  if(rich.version!==1||!rich.document||typeof rich.document.text!=='string'||!Array.isArray(rich.document.events)||rich.document.events.length>LIMIT||!Array.isArray(rich.document.comments)||!Array.isArray(rich.document.revisions)||rich.document.comments.some(c=>!c||typeof c!=='object')||rich.document.revisions.some(r=>!r||typeof r.id!=='string'||typeof r.text!=='string'||typeof r.title!=='string'))throw Error('Invalid lossless document archive.');
  validateEvents(rich.document.events);
  if(text!==rich.document.text)throw Error('The compact score and lossless archive disagree about the final text.');
  return {text:rich.document.text,cursor:start,elapsedMs:elapsed,events:structuredClone(rich.document.events),warnings:[...warnings],document:structuredClone(rich.document),lossless:true};
 }
 return {text,cursor:webscriptlog?end:start,elapsedMs:elapsed,events,warnings:[...warnings],lossless:false,format:webscriptlog?'webscriptlog':'margin'};
}
function validateEvents(events){const ids=new Set();for(const e of events){if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.sessionId!=='string'||typeof e.type!=='string'||!Number.isInteger(e.sequence)||!Number.isFinite(e.elapsedMs)||e.elapsedMs<0||!Number.isFinite(Date.parse(e.timestamp))||!e.data||typeof e.data!=='object'||Array.isArray(e.data)&&e.data.length>0)throw Error('Invalid event in lossless archive.');ids.add(e.id);}}
// Lower semantic edits to the original notation. Selections and clipboard operations
// become explicit cursor moves, backward deletions, and literal insertions.
function toPortable(source,options={}){
 const parsed=parse(source,options),warnings=new Set(parsed.warnings);
 if(parsed.lossless)throw Error('A lossless archive is not a portable score. Export without the archive to make a basic score.');
 const basic=/^(?:\d+(?:\.\d+)?|ENTER|DEL\d*|CLICK\d+)$/;
 const tokens=Array.from(source.matchAll(/<([^<>]*)>/g));
 if(tokens.every(m=>basic.test(m[1])))return {score:source,warnings:[...warnings],portable:true,format:'basic'};
 warnings.add('Basic compatibility output may synthesize CLICK positioning and expand selections or clipboard actions. Use faithful notation to represent user actions.');
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
 return {score,warnings:[...warnings],portable:true,format:'basic'};
}
const navigationKeys={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN',Home:'HOME',End:'END',PageUp:'PAGEUP',PageDown:'PAGEDOWN'};
// WebScriptLog's tool commands are markers; the following tokens carry their effects.
function toWebScriptLog(source){
 const parsed=parse(source);if(parsed.lossless)throw Error('WebScriptLog scores cannot contain a Margin archive. Export the log separately.');
 const out=[],warnings=new Set(parsed.warnings);let text='',start=0,end=0,anchor=0,focus=0,lastMs=0;
 const count=(name,n)=>'<'+name+(n===1?'':n)+'>';
 const encoded=value=>value.replace(/[<>\n]/g,c=>({'<':'<LT>','>':'<GT>','\n':'<ENTER>'}[c]));
 function wait(e){const delta=e.elapsedMs-lastMs;if(delta>0)out.push('<'+(delta/1000).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')+'>');lastMs=e.elapsedMs;}
 function state(a,b,backward=false){start=a;end=b;anchor=backward?b:a;focus=backward?a:b;}
 function resolve(a,b=a,backward=false,force=false){if(!force&&start===a&&end===b&&(a===b||focus===(backward?a:b)))return;if(a===b)out.push('<NAV'+a+'>');else out.push('<SEL'+(backward?b:a)+':'+(backward?a:b)+'>');state(a,b,backward);}
 function insert(value){out.push(encoded(value));text=text.slice(0,start)+value+text.slice(end);state(start+value.length,start+value.length);}
 function edit(d){
  const a=d.start,b=a+d.deleteCount,value=d.insert,selected=start===a&&end===b&&start!==end;
  if(value&&selected){insert(value);return;}
  if(d.deleteCount){
   if(selected){out.push('<DEL>');text=text.slice(0,a)+text.slice(b);state(a,a);}
   else if(start===end&&end===b){out.push(count('DEL',d.deleteCount));text=text.slice(0,a)+text.slice(b);state(a,a);}
   else if(start===end&&start===a){out.push(count('FDEL',d.deleteCount));text=text.slice(0,a)+text.slice(b);state(a,a);}
   else{resolve(a,b);out.push('<DEL>');text=text.slice(0,a)+text.slice(b);state(a,a);warnings.add('NAV/SEL resolve an edit range missing from the log; they are state metadata, not invented clicks.');}
  }else if(start!==a||end!==a){resolve(a);warnings.add('NAV resolves an edit position missing from the log; it does not claim a click.');}
  if(value)insert(value);
 }
 function key(d){
  const action=navigationKeys[d.key]||d.action,mods=d.modifiers||[],shift=mods.includes('SHIFT'),other=mods.filter(m=>m!=='SHIFT');let token;
  if(action==='ALL')token='SELECTALL';
  else if(!other.length&&['LEFT','RIGHT','UP','DOWN'].includes(action))token=(shift?'S':'')+action;
  else if(!mods.length&&['HOME','END','LEFT_TO_START','RIGHT_TO_END','UP_TO_START','DOWN_TO_END'].includes(action))token=action;
  else token='KEY:'+[...mods,action||'Navigation'].join('+');
  out.push('<'+token+'>');
  if(token==='LEFT')state(start!==end?start:Math.max(0,start-1),start!==end?start:Math.max(0,start-1));
  else if(token==='RIGHT')state(start!==end?end:Math.min(text.length,end+1),start!==end?end:Math.min(text.length,end+1));
  else if(token==='SLEFT'||token==='SRIGHT'){const target=token==='SLEFT'?Math.max(0,focus-1):Math.min(text.length,focus+1),fixed=anchor;state(Math.min(fixed,target),Math.max(fixed,target),target<fixed);}
  else if(['HOME','LEFT_TO_START','UP_TO_START'].includes(token))state(0,0);
  else if(['END','RIGHT_TO_END','DOWN_TO_END'].includes(token))state(text.length,text.length);
  resolve(d.start,d.end,d.direction==='backward');
 }
 for(const e of parsed.events){const d=e.data;
  if(e.type==='score_token'){if(d.pauseMs!==undefined)wait(e);continue;}
  if(e.type==='navigation'){
   wait(e);if(d.source==='pointer'||d.source==='touch'){if(d.start===d.end){out.push('<CLICK'+d.start+'>');state(d.start,d.end);}else resolve(d.start,d.end,d.direction==='backward',true);if(d.source==='touch')warnings.add('WebScriptLog represents clicks and taps as the same pointer action.');}
   else key(d);continue;
  }
  if(e.type==='selection'){wait(e);resolve(d.start,d.end,d.direction==='backward');continue;}
  if(['copy','cut','paste'].includes(e.type)){wait(e);out.push('<'+e.type.toUpperCase()+'>');continue;}
  if(e.type==='score_marker'){wait(e);const command=d.command.replace(/^KEY:/,'');out.push(/^(COPY|CUT|PASTE|SELECTALL|UNDO\d*|REDO\d*)$/.test(command)?'<'+command+'>':'<KEY:'+command+'>');continue;}
  if(e.type==='text_change'){
   wait(e);if(d.inputType==='historyUndo')out.push('<UNDO>');else if(d.inputType==='historyRedo')out.push('<REDO>');
   else if(!['insertText','insertLineBreak','deleteContentBackward','deleteContentForward','deleteByCut','insertFromPaste'].includes(d.inputType))out.push('<KEY:'+String(d.inputType).replace(/[<>]/g,'')+'>');
   edit(d);continue;
  }
  if(['session_start','document_open'].includes(e.type)&&typeof d.text==='string'&&d.text!==text){wait(e);out.push('<KEY:Snapshot>');edit({start:0,deleteCount:text.length,insert:d.text});warnings.add('WebScriptLog has no snapshot token; KEY:Snapshot labels the explicit text effect.');}
  if(e.type==='score_unknown')warnings.add('Unsupported Margin markers are omitted from WebScriptLog output.');
 }
 const score=out.join('');if(score.length>MAX_SOURCE)throw Error('WebScriptLog score exceeds the 2 MB limit.');
 const checked=parse(score,{format:'webscriptlog'});if(checked.text!==parsed.text||checked.elapsedMs!==parsed.elapsedMs)throw Error('WebScriptLog conversion failed text or timing validation.');
 return {score,warnings:[...warnings],format:'webscriptlog',portable:false,faithful:true,lossless:false};
}
function exportFaithful(document,options={}){
 const events=document.events||[];validateEvents(events);
 const out=[],warnings=new Set();let text='',start=0,end=0,selectionDirection='forward',pendingSelection=null,last=null,pendingCut=null,lastNavigation=null;
 const isKeyboard=e=>e.type==='keyup'&&e.data.element==='editor'&&(navigationKeys[e.data.key]||(e.data.key?.toLowerCase()==='a'&&(e.data.ctrl||e.data.meta)));
 const range=d=>({start:d.start??d.selectionStart,end:d.end??d.selectionEnd,direction:d.direction??d.selectionDirection});
 const matches=r=>r.start===start&&r.end===end&&(start===end||!r.direction||r.direction===selectionDirection);
 function wait(e){let ms=last?(last.sessionId===e.sessionId?e.elapsedMs-last.elapsedMs:Date.parse(e.timestamp)-Date.parse(last.timestamp)):e.elapsedMs;if(ms<0){warnings.add('A clock moved backwards; that pause was set to zero.');ms=0;}if(ms>0)out.push('<'+String(Math.round(ms)/1000)+'>');last=e;}
 function valid(r){return Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>=r.start&&r.end<=text.length;}
 function unknownSelection(e,r){if(!valid(r)||matches(r))return;wait(e);out.push(r.start===r.end?'<MOVE'+r.start+'>':'<SELECT'+r.start+':'+r.end+(r.direction==='backward'?':B':'')+'>');start=r.start;end=r.end;selectionDirection=r.direction||'forward';warnings.add('Some recorded selections have no known cause. MOVE/SELECT preserve their positions without claiming a click or keypress.');}
 function navigation(e){const d=e.data,r=range(d);if(!valid(r))return;if(!r.direction&&pendingSelection?.start===r.start&&pendingSelection?.end===r.end)r.direction=pendingSelection.direction;pendingSelection=null;wait(d.actionElapsedMs===undefined?e:{...e,elapsedMs:d.actionElapsedMs,timestamp:d.actionTimestamp||e.timestamp});
  const backward=r.direction==='backward'?':B':'';
  if(d.source==='touch'||d.source==='pointer')out.push('<'+(d.source==='touch'?'TAP':'CLICK')+r.start+(r.start===r.end?'':':'+r.end+backward)+'>');
  else{const action=navigationKeys[d.key]||d.action||(d.key?.toLowerCase()==='a'?'ALL':null);if(!action){unknownSelection(e,r);return;}const mods=d.modifiers||[['ctrl','CTRL'],['meta','META'],['alt','ALT'],['shift','SHIFT']].filter(([key])=>d[key]).map(([,name])=>name);out.push('<'+(mods.length?mods.join('+')+'+':'')+action+'@'+r.start+':'+r.end+backward+'>');}
  start=r.start;end=r.end;selectionDirection=r.direction||'forward';lastNavigation={key:d.key,start,end};
 }
 function followedByNavigation(i,r){for(let j=i+1;j<events.length;j++){const next=events[j];if(next.sessionId!==events[i].sessionId||next.elapsedMs-events[i].elapsedMs>150||next.type==='text_change'||typeof next.data.text==='string')break;if(next.type==='navigation'||isKeyboard(next)){const target=range(next.data);return target.start===r.start&&target.end===r.end;}}return false;}
 for(let i=0;i<events.length;i++){
  const e=events[i],d=e.data||{};
  if(e.type==='score_token'){if(d.scoreFormat!=='webscriptlog'||d.pauseMs!==undefined){out.push(d.raw);last=e;}continue;}
  if(d.scoreDerived&&d.scoreFormat!=='webscriptlog'){if(e.type==='text_change'){text=text.slice(0,d.start)+d.insert+text.slice(d.start+d.deleteCount);start=end=d.start+d.insert.length;}if(e.type==='selection'){start=d.start;end=d.end;selectionDirection=d.direction||'forward';}if(['session_start','document_open'].includes(e.type)&&typeof d.text==='string'){text=d.text;start=end=text.length;}continue;}
  if(e.type==='score_marker'){wait(e);out.push('<KEY:'+d.command.replace(/^KEY:/,'')+'>');continue;}
  if(d.markerOnly&&['copy','cut','paste'].includes(e.type)){wait(e);out.push('<KEY:'+e.type.toUpperCase()+'>');continue;}
  if(e.type==='keydown'&&d.element==='editor'){lastNavigation=null;continue;}
  if(e.type==='navigation'){navigation(e);continue;}
  if(isKeyboard(e)){const r=range(d);if(lastNavigation?.key===d.key&&matches(r))continue;navigation({...e,data:{...d,source:'keyboard'}});continue;}
  if(e.type==='selection'){const r=range(d);if(followedByNavigation(i,r))pendingSelection=r;else unknownSelection(e,r);continue;}
  if(e.type==='copy'||e.type==='cut'){
   const r=range(d);if(!valid(r))throw Error('Invalid clipboard selection in log.');wait(e);
   let cutDeleted=false;
   if(e.type==='cut')for(let j=i+1;j<events.length;j++){const next=events[j],patch=next.data;if(next.sessionId!==e.sessionId||next.type==='cut'||typeof patch.text==='string')break;if(next.type==='text_change'){cutDeleted=patch.inputType==='deleteByCut'&&patch.start===r.start&&patch.deleteCount===r.end-r.start&&!patch.insert;break;}}
   if(e.type==='copy')out.push(matches(r)?'<COPY>':payload('CLIP',{kind:'copy',start:r.start,end:r.end}));
   else if(cutDeleted){out.push(matches(r)?'<CUT>':payload('CUT',{start:r.start,end:r.end}));pendingCut={start:r.start,deleteCount:r.end-r.start};text=text.slice(0,r.start)+text.slice(r.end);}
   else{out.push(payload('CLIP',{kind:'cut',start:r.start,end:r.end}));warnings.add('A cut event had no recorded deletion; its clipboard marker is retained without removing text.');}
   start=r.start;end=cutDeleted?start:r.end;selectionDirection=r.direction||'forward';continue;
  }
  if(e.type==='text_change'){
   if(pendingCut&&d.inputType==='deleteByCut'&&d.start===pendingCut.start&&d.deleteCount===pendingCut.deleteCount&&!d.insert){pendingCut=null;continue;}
   pendingCut=null;
   if(!Number.isInteger(d.start)||!Number.isInteger(d.deleteCount)||d.start<0||d.deleteCount<0||d.start+d.deleteCount>text.length||typeof d.insert!=='string')throw Error('Cannot export an invalid text patch.');
   wait(e);
   const selected=start!==end&&d.start===start&&d.deleteCount===end-start;
   const backwardDelete=/^delete(?:Content|Word|SoftLine|HardLine)Backward$/.test(d.inputType),forwardDelete=/^delete(?:Content|Word|SoftLine|HardLine)Forward$/.test(d.inputType);
   if(d.scoreFormat==='webscriptlog'&&d.inputType==='insertFromPaste')out.push(payload('PATCH',{start:d.start,deleteCount:d.deleteCount,insert:d.insert,inputType:d.inputType}));
   else if(d.insert&&(selected||start===end&&d.start===start&&!d.deleteCount)&&['insertText','insertLineBreak','insertParagraph','insertFromPaste'].includes(d.inputType))out.push(d.inputType==='insertFromPaste'?payload('PASTE',d.insert):escapeText(d.insert));
   else if(!d.insert&&d.deleteCount&&(backwardDelete||forwardDelete)&&(selected||start===end&&(forwardDelete?d.start===start:d.start+d.deleteCount===start)))out.push('<'+(forwardDelete?'FWD':'DEL')+(selected||d.deleteCount===1?'':d.deleteCount)+'>');
   else{out.push(payload('PATCH',{start:d.start,deleteCount:d.deleteCount,insert:d.insert,inputType:d.inputType||'insertReplacementText'}));if(!selected&&d.start!==start&&d.start+d.deleteCount!==start)warnings.add('An edit has no matching recorded navigation. PATCH preserves the edit without inventing a cursor action.');}
   text=text.slice(0,d.start)+d.insert+text.slice(d.start+d.deleteCount);start=end=d.start+d.insert.length;continue;
  }
  if(typeof d.text==='string'&&['session_start','document_open','recording_resumed','recording_paused','revision_restore','checkpoint'].includes(e.type)){
   if(d.text!==text){wait(e);out.push(payload('BASE',d.text));text=d.text;start=end=text.length;}
   else if(e.type==='session_start'&&!last)last=e;
  }
 }
 if(text!==document.text){out.push(payload('BASE',document.text));warnings.add('Final text needed a snapshot because some changes were not recorded.');}
 if(options.lossless)out.push(payload('RICH',{version:1,document}));
 const score=out.join('');if(score.length>MAX_SOURCE)throw Error('This score exceeds the 2 MB import limit.');
 if(parse(score).text!==document.text)throw Error('Faithful score failed final-text validation.');
 return {score,warnings:[...warnings],lossless:!!options.lossless,portable:false,faithful:true,format:'margin'};
}
function exportScore(document,options={}){
 if(options.format==='webscriptlog'&&options.lossless)throw Error('Choose Margin archive notation for a lossless archive.');
 const faithful=exportFaithful(document,options);
 if(options.format==='webscriptlog'){const converted=toWebScriptLog(faithful.score);return {...converted,warnings:[...new Set([...faithful.warnings,...converted.warnings])]};}
 if(!options.portable)return faithful;
 if(options.lossless)throw Error('Lossless archives require faithful notation.');
 const portable=toPortable(faithful.score);
 return {...portable,warnings:[...new Set([...faithful.warnings,...portable.warnings])],lossless:false,faithful:false,format:'basic'};
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
 const output=options.format==='webscriptlog'?toWebScriptLog(generated):options.extended?{score:generated,warnings:[]}:toPortable(generated);
 return {...output,expectedText:target,seed,edits,durationMs:result.elapsedMs,extended:!!options.extended};
}
root.MarginWritingScore={parse,exportScore,generate,toPortable,toWebScriptLog,encode,payload,sample,sampleText};
if(typeof module!=='undefined')module.exports=root.MarginWritingScore;
})(typeof globalThis!=='undefined'?globalThis:window);
