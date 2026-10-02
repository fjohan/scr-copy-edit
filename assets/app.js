'use strict';
const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID();
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initialText = `There is a particular kind of quiet that arrives when you put your phone in another room. Not silence, exactly. The world is still there: a kettle coming to the boil, the low conversation of traffic, a bird making its small, insistent claim on the morning. But something shifts. You are, for a moment, entirely where you are.

I have been thinking about attention as a form of generosity. We tend to talk about it as a resource — something to spend, save, or lose. But what if it is also something we give? To a person across the table. To a paragraph that asks us to slow down. To the ordinary, unremarkable texture of a Tuesday.

The trouble is that we have become very good at being elsewhere. We read while waiting for something else to happen. We listen while composing our reply. We walk through a familiar street and arrive at the other end without having seen it. Our days fill up, but they do not always deepen.

Last week, I took the long way home. No podcast, no destination worth mentioning. Just a different street, and the willingness to notice. A blue door with peeling paint. Someone watering a plant on a third-floor balcony. The smell of bread from a shop I had passed a hundred times without stepping inside.

Nothing remarkable happened. And yet, I remember it.

Maybe attention begins here: not in the grand gesture, but in the small decision to stay. To look a little longer. To let a thought finish before reaching for the next one. We cannot attend to everything. But we can choose, more often than we think, to attend to something.

And perhaps that is enough for a beginning.`;
function seedDocument(title, text, comments = []) {
  const now = new Date().toISOString();
  return {id:uid(),title,text,createdAt:now,updatedAt:now,comments:comments.map(c=>({...c,id:uid(),start:text.indexOf(c.quote),end:text.indexOf(c.quote)+c.quote.length,resolved:false})),revisions:[{id:uid(),title:'First draft',text,comments:[],date:now,major:false},{id:uid(),title:'A little more intention',text,comments:[],date:now,major:true}],events:[]};
}
const seed = () => ({version:1,activeId:null,documents:[seedDocument('The art of paying attention',initialText,[{quote:'attention as a form of generosity',kind:'Clarity',text:'This is the heart of the piece. Could you bring this idea forward a little sooner?'},{quote:'Our days fill up, but they do not always deepen.',kind:'Voice & tone',text:'A lovely turn of phrase. Give this sentence a little room to breathe.'},{quote:'And perhaps that is enough for a beginning.',kind:'Structure',text:'Consider returning to the quiet of the opening. A small echo might make the ending feel more complete.'}]),seedDocument('Notes on a slower morning','What would a morning feel like if it didn’t begin with a screen?\n\nA few notes on making space for the day.'),seedDocument('A place to begin','Start with what you notice.\n\nThe rest can follow.')]});
let state=seed();state.activeId=state.documents[0].id;
let workspaceStore=null,storageReady=false,storageBackend='',localVersion=0,savedLocalVersion=-1,maxSaveTimer=null;
let recording=true, activeComment=0, currentView='write', pendingSelection=null, saveTimer, syncTimer, serverReady=false, replayTimer=null;
const sessionId=uid(), sessionStart=performance.now();
const doc=()=>state.documents.find(d=>d.id===state.activeId);
const timeLabel=iso=>new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
let localSaveFailed=false,localSavePending=0;
function showStorageFailure(error){$('storage-notice').hidden=false;$('storage-notice-text').textContent='Device save failed ('+(storageBackend||'storage')+': '+(error.name||'Error')+'): '+error.message+' Download a workspace backup before reloading.';}
async function persist(){
 if(!storageReady)return;
 clearTimeout(saveTimer);clearTimeout(maxSaveTimer);maxSaveTimer=null;
 const version=localVersion;localSavePending++;$('save-status').textContent='Saving on device…';
 try{const saved=await workspaceStore.save(state);storageBackend=saved.backend;savedLocalVersion=version;localSaveFailed=false;$('storage-notice').hidden=true;if(version===localVersion)$('save-status').textContent=serverReady?'Saved on device · syncing':'Saved on device';}
 catch(error){localSaveFailed=true;$('save-status').textContent='Device save failed';showStorageFailure(error);}
 finally{localSavePending--;clearTimeout(syncTimer);syncTimer=setTimeout(sync,900);}
}
function scheduleSave(){localVersion++;if(!storageReady)return;clearTimeout(saveTimer);saveTimer=setTimeout(persist,180);if(maxSaveTimer===null)maxSaveTimer=setTimeout(persist,1500);if(!localSaveFailed)$('save-status').textContent='Saving on device…';}

function log(type,data={},target=doc()){
 if(!recording){scheduleSave();return;}
 target.events.push({id:uid(),sequence:target.events.length+1,sessionId,timestamp:new Date().toISOString(),elapsedMs:Math.round(performance.now()-sessionStart),type,data:structuredClone(data)});
 $('event-count').textContent=doc().events.length+' events captured';scheduleSave();
}
function stats(){const words=doc().text.trim().split(/\s+/).filter(Boolean).length;$('word-count').textContent=words+' words';$('reading-time').textContent=Math.max(1,Math.ceil(words/220))+' min read';$('revision-count').textContent=doc().revisions.length;$('draft-number').textContent=String(doc().revisions.length+1).padStart(2,'0');}
let libraryQuery='',libraryFilter='all',librarySort='recent',visibleDocuments=[];
try{const savedSort=localStorage.getItem('margin-library-sort');if(['recent','name','oldest'].includes(savedSort))librarySort=savedSort;}catch{}
$('document-sort').value=librarySort;
function renderLibrary(){
 visibleDocuments=MarginDocumentLibrary.select(state.documents,{query:libraryQuery,filter:libraryFilter,sort:librarySort});
 $('document-list').innerHTML=visibleDocuments.map(d=>{const date=new Date(d.updatedAt);const label=Number.isFinite(date.getTime())?date.toLocaleDateString([], {month:'short',day:'numeric'})+' · '+date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Undated';return `<div class="document-row"><button class="document-item ${d.id===state.activeId?'active':''}" data-document="${escapeHTML(d.id)}" ${d.id===state.activeId?'aria-current="page"':''} title="${escapeHTML(d.title||'Untitled')}"><span class="doc-icon">▤</span><span class="document-item-text"><strong>${escapeHTML(d.title||'Untitled')}</strong><small>${d.id===state.activeId?'Editing now':escapeHTML(label)}${d.writingScore?' <span class="library-test-tag">Test</span>':''}</small></span></button><button type="button" class="delete-document-button" data-delete-document="${escapeHTML(d.id)}" aria-label="Delete ${escapeHTML(d.title||'Untitled')}" title="Delete ${escapeHTML(d.title||'Untitled')}">×</button></div>`;}).join('')||'<div class="library-empty"><strong>No documents found</strong><span>Try a different search or filter.</span><button id="reset-library-search">Clear filters</button></div>';
 $('library-count').textContent=visibleDocuments.length===state.documents.length?state.documents.length+' documents':visibleDocuments.length+' of '+state.documents.length+' documents';
 $('clear-document-search').hidden=!libraryQuery;
 $('show-current-document').hidden=visibleDocuments.some(d=>d.id===state.activeId);
}
function revealCurrentDocument(){const list=$('document-list');const item=list.querySelector('[aria-current="page"]');if(!item)return;const top=item.offsetTop,bottom=top+item.offsetHeight;if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=Math.max(0,bottom-list.clientHeight);}
function resetLibrary(){libraryQuery='';libraryFilter='all';$('document-search').value='';$('document-filter').value='all';renderLibrary();}
$('document-search').addEventListener('input',e=>{libraryQuery=e.target.value;renderLibrary();$('document-list').scrollTop=0;});
$('document-search').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();libraryQuery='';e.target.value='';renderLibrary();}if(e.key==='Enter'&&visibleDocuments.length){e.preventDefault();switchDocument(visibleDocuments[0].id);}});
$('clear-document-search').onclick=()=>{libraryQuery='';$('document-search').value='';renderLibrary();$('document-search').focus();};
$('document-filter').onchange=e=>{libraryFilter=e.target.value;renderLibrary();$('document-list').scrollTop=0;log('tool',{tool:'document_filter',filter:libraryFilter});};
$('document-sort').onchange=e=>{librarySort=e.target.value;renderLibrary();$('document-list').scrollTop=0;try{localStorage.setItem('margin-library-sort',librarySort);}catch{}log('tool',{tool:'document_sort',sort:librarySort});};
$('show-current-document').onclick=()=>{resetLibrary();revealCurrentDocument();};

function renderHighlights(){const d=doc();let ranges=d.comments.filter(c=>!c.resolved && c.start>=0 && c.end>c.start && c.end<=d.text.length).sort((a,b)=>a.start-b.start);let html='',position=0;for(const c of ranges){if(c.start<position)continue;html+=escapeHTML(d.text.slice(position,c.start))+`<mark class="${d.comments.indexOf(c)===activeComment?'selected':''}">${escapeHTML(d.text.slice(c.start,c.end))}</mark>`;position=c.end;}html+=escapeHTML(d.text.slice(position))+'\n';$('text-backdrop').innerHTML=html;resizeEditor();}
function resizeEditor(){$('editor').style.height='auto';$('editor').style.height=Math.max(560,$('editor').scrollHeight)+'px';}
function renderComments(){const d=doc();activeComment=Math.max(0,Math.min(activeComment,d.comments.length-1));$('comment-count').textContent=d.comments.filter(c=>!c.resolved).length;$('suggestion-position').textContent=d.comments.length?`${activeComment+1} of ${d.comments.length} suggestions`:'No suggestions yet';$('previous-comment').disabled=!d.comments.length;$('next-comment').disabled=!d.comments.length;$('comments-list').innerHTML=d.comments.map((c,i)=>`<div class="comment-card ${i===activeComment?'active':''} ${c.resolved?'resolved':''}" data-comment="${i}" tabindex="0"><div class="comment-type"><span><span class="kind-dot"></span>${escapeHTML(c.kind)}</span><span>${String(i+1).padStart(2,'0')}</span></div><blockquote>“${escapeHTML(c.quote)}”</blockquote><p>${escapeHTML(c.text)}</p><button class="resolve-button" data-resolve="${i}">${c.resolved?'↶ Reopen':'○ Mark resolved'}</button></div>`).join('') || '<p class="section-description">Select a passage and add your first thought.</p>';renderHighlights();}
function renderDocument(){const d=doc();$('document-title').value=d.title;$('breadcrumb-title').textContent=d.title;$('editor').value=d.text;$('document-date').textContent=new Date(d.createdAt).toLocaleDateString([], {month:'long',day:'numeric',year:'numeric'});$('event-count').textContent=d.events.length+' events captured';renderLibrary();stats();renderComments();if(currentView==='revisions')renderRevisions();if(currentView==='process')renderProcess();if(currentView==='analysis')renderAnalysis();if(currentView==='score')updateScoreDocumentLabel();}
function switchDocument(id){log('document_leave',{documentId:doc().id});state.activeId=id;activeComment=0;log('document_open',{text:doc().text,title:doc().title,comments:doc().comments});renderDocument();revealCurrentDocument();persist();$('library').classList.remove('open');}
function newDocument(){const d=seedDocument('Untitled draft','');d.revisions=[];state.documents.unshift(d);resetLibrary();switchDocument(d.id);$('document-title').focus();$('document-title').select();toast('A fresh page. Make it yours.');}
$('new-document').onclick=newDocument;$('new-document-bottom').onclick=newDocument;
$('document-list').onclick=e=>{if(e.target.closest('#reset-library-search')){resetLibrary();return;}const deleteButton=e.target.closest('[data-delete-document]');if(deleteButton){openDeleteDocument(deleteButton.dataset.deleteDocument);return;}const b=e.target.closest('[data-document]');if(b)switchDocument(b.dataset.document);};

let pendingDeleteId=null;
function openDeleteDocument(id){const target=state.documents.find(d=>d.id===id);if(!target)return;pendingDeleteId=id;$('delete-document-message').textContent='“'+(target.title||'Untitled')+'”';$('delete-document-dialog').showModal();}
function closeDeleteDocument(){pendingDeleteId=null;$('delete-document-dialog').close();}
$('close-delete-document').onclick=closeDeleteDocument;
$('cancel-delete-document').onclick=closeDeleteDocument;
$('delete-document-dialog').addEventListener('close',()=>{pendingDeleteId=null;});
$('confirm-delete-document').onclick=async()=>{const id=pendingDeleteId,index=state.documents.findIndex(d=>d.id===id);if(index<0){closeDeleteDocument();return;}
 $('confirm-delete-document').disabled=true;
 try{state.documents.splice(index,1);if(!state.documents.length){const blank=seedDocument('Untitled draft','');blank.revisions=[];state.documents.push(blank);resetLibrary();}
 if(state.activeId===id)state.activeId=state.documents[Math.min(index,state.documents.length-1)].id;
 pendingSelection=null;activeComment=0;closeDeleteDocument();renderDocument();revealCurrentDocument();localVersion++;await persist();toast(localSaveFailed?'Deletion has not saved on this device.':'Document deleted.');}
 finally{$('confirm-delete-document').disabled=false;}
};
$('menu-toggle').onclick=()=>$('library').classList.toggle('open');
const writingSettingsKey='margin-writing-settings';
function readWritingSettings(){try{const saved=JSON.parse(localStorage.getItem(writingSettingsKey)||'null');return {spellcheck:saved?.spellcheck===true,autocorrect:saved?.autocorrect!==false};}catch{return {spellcheck:false,autocorrect:true};}}
let writingSettings=readWritingSettings();
function applyWritingSettings(){const editor=$('editor');editor.setAttribute('spellcheck',String(writingSettings.spellcheck));editor.setAttribute('autocorrect',writingSettings.autocorrect?'on':'off');$('setting-spellcheck').checked=writingSettings.spellcheck;$('setting-autocorrect').checked=writingSettings.autocorrect;}
function changeWritingSetting(key,value){writingSettings[key]=value;applyWritingSettings();try{localStorage.setItem(writingSettingsKey,JSON.stringify(writingSettings));}catch{toast('Setting changed for this tab, but could not be saved on this device.');}log('tool',{tool:'writing_settings',setting:key,value});}
applyWritingSettings();
$('writing-settings').onclick=()=>{$('library').classList.remove('open');$('writing-settings-dialog').showModal();};
$('close-writing-settings').onclick=()=>$('writing-settings-dialog').close();
$('done-writing-settings').onclick=()=>$('writing-settings-dialog').close();
$('setting-spellcheck').onchange=e=>changeWritingSetting('spellcheck',e.target.checked);
$('setting-autocorrect').onchange=e=>changeWritingSetting('autocorrect',e.target.checked);
$('document-title').addEventListener('input',()=>{doc().title=$('document-title').value;doc().updatedAt=new Date().toISOString();log('title_change',{title:doc().title});$('breadcrumb-title').textContent=doc().title;renderLibrary();});
let inputHint=null;
function adjustAnchors(oldText,newText,hint=null){const patch=MarginTextEdits.diff(oldText,newText,hint);const {start,deleteCount,insert}=patch;const oldEnd=start+deleteCount,delta=insert.length-deleteCount;for(const c of doc().comments){if(c.start<0)continue;if(oldEnd<=c.start){c.start+=delta;c.end+=delta;}else if(start<c.end){c.start=-1;c.end=-1;}}return patch;}
$('editor').addEventListener('beforeinput',e=>{inputHint={inputType:e.inputType,data:e.data,selectionStart:e.target.selectionStart,selectionEnd:e.target.selectionEnd,isComposing:e.isComposing};log('before_input',inputHint);});
$('editor').addEventListener('input',e=>{const previous=doc().text;doc().text=e.target.value;const change=adjustAnchors(previous,doc().text,inputHint);inputHint=null;doc().updatedAt=new Date().toISOString();log('text_change',{...change,inputType:e.inputType,selectionStart:e.target.selectionStart,selectionEnd:e.target.selectionEnd});stats();renderHighlights();});
for(const type of ['keydown','keyup'])document.addEventListener(type,e=>log(type,{element:e.target.id||e.target.tagName,key:e.key,code:e.code,alt:e.altKey,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,repeat:e.repeat,selectionStart:e.target.selectionStart??null,selectionEnd:e.target.selectionEnd??null}));
for(const id of ['comment-text','comment-kind'])$(id).addEventListener('input',e=>log('comment_draft',{element:id,value:e.target.value}));
for(const type of ['compositionstart','compositionend','paste','cut','copy'])$('editor').addEventListener(type,e=>log(type,{data:e.data||null,selectedText:doc().text.slice(e.target.selectionStart,e.target.selectionEnd),selectionStart:e.target.selectionStart,selectionEnd:e.target.selectionEnd}));
let lastSelection='';function captureSelection(){const editor=$('editor');const key=`${doc().id}:${editor.selectionStart}:${editor.selectionEnd}:${editor.selectionDirection}`;if(key===lastSelection)return;lastSelection=key;pendingSelection={start:editor.selectionStart,end:editor.selectionEnd};log('selection',{...pendingSelection,direction:editor.selectionDirection});}
$('editor').addEventListener('select',captureSelection);$('editor').addEventListener('keyup',captureSelection);$('editor').addEventListener('pointerup',captureSelection);
function openComment(){captureSelection();const sel=pendingSelection;if(!sel || sel.start===sel.end){toast('Select a passage in your draft first.');$('editor').focus();return;}$('selected-quote').textContent=doc().text.slice(sel.start,sel.end);$('comment-text').value='';$('comment-dialog').showModal();$('comment-text').focus();log('tool',{tool:'add_comment',selection:sel});}
$('highlight-button').onclick=openComment;$('add-comment').onclick=openComment;$('close-dialog').onclick=()=>$('comment-dialog').close();
$('comment-form').onsubmit=e=>{e.preventDefault();const c={id:uid(),start:pendingSelection.start,end:pendingSelection.end,quote:doc().text.slice(pendingSelection.start,pendingSelection.end),text:$('comment-text').value.trim(),kind:$('comment-kind').value,resolved:false};if(!c.text)return;doc().comments.push(c);activeComment=doc().comments.length-1;log('comment_added',{comment:c});renderComments();persist();$('comment-dialog').close();toast('Thought added to the margin.');};
function selectComment(index){activeComment=index;renderComments();const c=doc().comments[index];if(c && c.start>=0){$('editor').focus();$('editor').setSelectionRange(c.start,c.end);captureSelection();}log('suggestion_navigation',{index});}
$('comments-list').onclick=e=>{const resolve=e.target.closest('[data-resolve]');if(resolve){const c=doc().comments[Number(resolve.dataset.resolve)];c.resolved=!c.resolved;log('comment_resolved',{id:c.id,resolved:c.resolved});renderComments();return;}const card=e.target.closest('[data-comment]');if(card)selectComment(Number(card.dataset.comment));};
$('comments-list').onkeydown=e=>{if(e.key==='Enter' && e.target.matches('[data-comment]'))selectComment(Number(e.target.dataset.comment));};
$('previous-comment').onclick=()=>selectComment((activeComment-1+doc().comments.length)%doc().comments.length);$('next-comment').onclick=()=>selectComment((activeComment+1)%doc().comments.length);
function editingCommand(command){$('editor').focus();document.execCommand(command);log('tool',{tool:command});}
$('undo-button').onclick=()=>editingCommand('undo');$('redo-button').onclick=()=>editingCommand('redo');
function setView(view){clearInterval(replayTimer);replayTimer=null;currentView=view;document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.view===view));document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===view+'-view'));log('view_change',{view});if(view==='process')renderProcess();if(view==='revisions')renderRevisions();if(view==='analysis')renderAnalysis();if(view==='score')updateScoreDocumentLabel();}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('checkpoint-button').onclick=()=>{const d=doc();const r={id:uid(),title:'Checkpoint '+(d.revisions.length+1),capturePaused:!recording,text:d.text,comments:structuredClone(d.comments),date:new Date().toISOString(),major:false};d.revisions.push(r);log('checkpoint',{revisionId:r.id,text:r.text,title:d.title});r.eventSequence=d.events.at(-1)?.sequence??0;stats();if(currentView==='analysis')renderAnalysis();if(currentView==='revisions')renderRevisions();persist();toast('Checkpoint saved. Your words are safe here.');};
function renderRevisions(){$('revisions-list').innerHTML=[...doc().revisions].reverse().map(r=>`<article class="revision-card"><div class="revision-top"><h3>${escapeHTML(r.title)}</h3>${r.major?'<span class="major-tag">Major revision</span>':''}<small>${new Date(r.date).toLocaleString()}</small></div><p>${escapeHTML(r.text.slice(0,190))}${r.text.length>190?'…':''}</p><div class="revision-actions"><button class="button" data-restore="${r.id}">↶ Restore this draft</button><button class="button quiet" data-flag="${r.id}">${r.major?'Remove major flag':'Flag as major'}</button></div></article>`).join('')||'<p class="section-description">Save your first checkpoint when you’re ready.</p>';}
$('revisions-list').onclick=e=>{const flag=e.target.closest('[data-flag]'),restore=e.target.closest('[data-restore]');if(flag){const r=doc().revisions.find(r=>r.id===flag.dataset.flag);r.major=!r.major;log('revision_flag',{revisionId:r.id,major:r.major});renderRevisions();persist();}if(restore){const r=doc().revisions.find(r=>r.id===restore.dataset.restore);doc().revisions.push({id:uid(),title:'Before restoring '+r.title,capturePaused:!recording,eventSequence:doc().events.at(-1)?.sequence??0,text:doc().text,comments:structuredClone(doc().comments),date:new Date().toISOString(),major:false});doc().text=r.text;doc().comments=structuredClone(r.comments||[]);log('revision_restore',{revisionId:r.id,text:r.text,comments:doc().comments});renderDocument();persist();toast('Draft restored. Previous work kept as a checkpoint.');}};
function replayAt(index){const events=doc().events;let text='';let title=doc().title;let selection=null;for(let i=0;i<=index && i<events.length;i++){const e=events[i];if(typeof e.data.text==='string')text=e.data.text;if(e.type==='text_change')text=text.slice(0,e.data.start)+e.data.insert+text.slice(e.data.start+e.data.deleteCount);if(e.data.title!==undefined)title=e.data.title;if(e.type==='selection')selection=e.data;}const e=events[index];$('replay-text').textContent=text;$('replay-detail').textContent=e?`${timeLabel(e.timestamp)} · ${e.type.replaceAll('_',' ')} · ${title}${selection?' · cursor '+selection.start+'–'+selection.end:''}`:'Start writing to capture your process.';if(e){$('replay-detail').title=JSON.stringify(e.data);$('replay-text').dataset.event=e.type;} }
function renderProcess(){const events=doc().events;const keys=events.filter(e=>e.type==='keydown').length;const edits=events.filter(e=>e.type==='text_change').length;$('process-stats').innerHTML=[['Events captured',events.length],['Keystrokes',keys],['Text changes',edits]].map(([label,value])=>`<div class="stat"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`).join('');$('replay-slider').max=Math.max(0,events.length-1);$('replay-slider').value=0;$('play-replay').textContent='▶ Play';replayAt(0);$('event-list').innerHTML=events.slice(-100).reverse().map(e=>`<div class="event-row"><time>${timeLabel(e.timestamp)}</time><code>${escapeHTML(e.type)}</code><span>${escapeHTML(JSON.stringify(e.data).slice(0,150))}</span></div>`).join('');}
$('replay-slider').oninput=()=>replayAt(Number($('replay-slider').value));
$('play-replay').onclick=()=>{if(replayTimer){clearInterval(replayTimer);replayTimer=null;$('play-replay').textContent='▶ Play';return;}if(!doc().events.length)return;if(Number($('replay-slider').value)>=doc().events.length-1)$('replay-slider').value=0;$('play-replay').textContent='Ⅱ Pause';replayTimer=setInterval(()=>{let next=Number($('replay-slider').value)+1;if(next>=doc().events.length){clearInterval(replayTimer);replayTimer=null;$('play-replay').textContent='↻ Replay';return;}$('replay-slider').value=next;replayAt(next);},130);};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-button').onclick=()=>{log('tool',{tool:'export_document'});download((doc().title||'draft')+'.txt',doc().title+'\n\n'+doc().text,'text/plain');};
$('export-log').onclick=()=>{log('tool',{tool:'export_process'});download('margin-process-'+doc().id+'.json',JSON.stringify({schemaVersion:1,document:doc(),exportedAt:new Date().toISOString()},null,2),'application/json');};
$('capture-toggle').onclick=()=>{if(recording){log('recording_paused',{text:doc().text});recording=false;}else{recording=true;log('recording_resumed',{text:doc().text,title:doc().title});}$('capture-toggle').textContent=recording?'Ⅱ':'▶';$('recording-status').textContent=recording?'Process recording on':'Process recording paused';document.querySelector('.record-dot').style.background=recording?'#718b60':'#c29b61';toast(recording?'Process recording resumed.':'Process recording paused.');persist();};
document.addEventListener('focusin',e=>log('focus',{area:e.target.closest('.comments-panel,dialog')?'sidebar':e.target.closest('.paper')?'document':'workspace',element:e.target.id||e.target.tagName}));
document.addEventListener('focusout',e=>log('blur',{element:e.target.id||e.target.tagName}));
window.addEventListener('blur',()=>log('window_blur'));window.addEventListener('focus',()=>log('window_focus'));document.addEventListener('visibilitychange',()=>{log('visibility',{state:document.visibilityState});if(document.visibilityState==='hidden')persist();});
let scrollTimer;document.addEventListener('scroll',e=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{const target=e.target===document?document.scrollingElement:e.target;log('scroll',{element:target.id||'page',x:target.scrollLeft,y:target.scrollTop});},100);},true);
document.addEventListener('click',e=>{const control=e.target.closest('button,select');if(control)log('tool_usage',{control:control.id||control.dataset.view||control.textContent.trim().slice(0,60)});});
window.addEventListener('pagehide',()=>{log('session_leave');persist();});
let syncing=false;async function sync(){
 if(!serverReady||syncing||!storageReady)return;
 const version=localVersion;syncing=true;
 try{const response=await fetch('api/workspace.php',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Margin-CSRF':csrfToken},body:JSON.stringify(state)});if(!response.ok)throw Error('Save failed');if(version===localVersion&&!localSavePending)$('save-status').textContent=localSaveFailed?'Saved to server · device save failed':'Saved on device and server';}
 catch{if(!localSavePending)$('save-status').textContent=localSaveFailed?'Not saved — device and server unavailable':savedLocalVersion===localVersion?'Saved on device · server unavailable':'Saving on device…';}
 finally{syncing=false;if(version!==localVersion){clearTimeout(syncTimer);syncTimer=setTimeout(sync,900);}}
}
let csrfToken='';
async function initialize(){
 document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);
 $('workspace-backup').disabled=true;
 try{workspaceStore=MarginWorkspaceStorage.create();const loaded=await workspaceStore.load();if(loaded.workspace)state=loaded.workspace;state.activeId=state.documents.some(d=>d.id===state.activeId)?state.activeId:state.documents[0].id;storageBackend=loaded.backend;storageReady=true;$('save-status').title='Local storage: '+storageBackend;
 document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);renderDocument();revealCurrentDocument();
 const readyForUser=storageReady;storageReady=!!loaded.workspace;
 log('session_start',{text:doc().text,title:doc().title,comments:doc().comments,viewport:{width:innerWidth,height:innerHeight},userAgent:navigator.userAgent});storageReady=readyForUser;
 const initialVersion=localVersion;if(loaded.workspace)await persist();
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch('api/workspace.php',{cache:'no-store',signal:controller.signal});if(response.ok){const result=await response.json();serverReady=true;csrfToken=result.csrfToken;if(!loaded.workspace&&result.workspace?.documents?.length&&localVersion===initialVersion){state=result.workspace;state.activeId=state.documents.some(d=>d.id===state.activeId)?state.activeId:state.documents[0].id;renderDocument();log('session_start',{text:doc().text,title:doc().title,source:'server-load'});revealCurrentDocument();}}}catch{/* Device saving works independently of network availability. */}finally{clearTimeout(timeout);}
 await persist();
 }catch(error){localSaveFailed=true;$('save-status').textContent='Cannot read device storage';$('storage-notice').hidden=false;$('storage-notice-text').textContent='Device storage could not be read ('+(error.name||'Error')+'): '+error.message+' Existing saved data has not been replaced. Editing is disabled; close other tabs and reload to retry.';}
}
$('workspace-backup').onclick=()=>download('margin-workspace-backup.json',JSON.stringify({schemaVersion:1,workspace:state,exportedAt:new Date().toISOString()},null,2),'application/json');
initialize();

let heatmapResult=null,analysisPresentation='heatmap';
function renderAnalysis(){
 const result=MarginWordAnalysis.analyze(doc());
 heatmapResult=result;
 const checkpoint=doc().revisions.at(-1);
 $('word-heatmap').innerHTML=checkpoint&&checkpoint.text.length?MarginWordHeatmap.render(checkpoint.text,result.rows):'<p class="heatmap-empty">Save a checkpoint containing some text to see its heatmap.</p>';
 $('heatmap-word-detail').innerHTML='<p>Select a word to see how it changed.</p>';
 setAnalysisPresentation(analysisPresentation);
 $('analysis-checkpoint').textContent=result.checkpoint?result.checkpoint.title:'No checkpoint yet';
 $('analysis-source-date').textContent=result.checkpoint?new Date(result.checkpoint.date).toLocaleString()+' · Latest checkpoint':'';
 $('analysis-warning').textContent=result.warnings.join(' ');
 $('analysis-warning').hidden=!result.warnings.length;
 $('export-analysis').disabled=!result.checkpoint;
 const known=result.rows.filter(r=>r.purity!==null);
 $('analysis-stats').innerHTML=[['Word occurrences',result.rows.length],['Typed once, unchanged',known.filter(r=>r.purity===100).length],['Incomplete histories',result.rows.length-known.length]].map(([label,value])=>`<div class="stat"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`).join('');
 const pauseCell=p=>`<td><details class="pause-info"><summary title="${escapeHTML(p.reason)}" aria-label="${escapeHTML(p.ms===null?'Unknown. '+p.reason:p.ms+' milliseconds. '+p.reason)}">${p.ms===null?'—':(p.ms/1000).toFixed(3)+' s'}</summary><p>${escapeHTML(p.reason)}</p></details></td>`;
 $('analysis-rows').innerHTML=result.rows.map(r=>`<tr><td class="word-index">${r.index}</td><th scope="row">${escapeHTML(r.word)}</th>${pauseCell(r.pauseBefore)}${pauseCell(r.pauseAfter)}<td><span class="purity-score ${r.purity===100?'pure':''}" title="${escapeHTML(r.provenance)}">${r.purity===null?'Unknown':r.purity+'/100'}</span></td><td><details class="word-history"><summary><code>${escapeHTML(r.history||'Pre-existing / unknown')}</code></summary><p class="word-provenance">${escapeHTML(r.provenance)} · Characters ${r.start}–${r.end}${r.shared?' · History is shared with another word after a split, join, or passage edit.':''}</p>${r.operations.map(op=>`<div class="word-operation"><time>${escapeHTML(op.timestamp)}</time><span>${escapeHTML(op.kind)} ${escapeHTML(JSON.stringify(op.removed))} → ${escapeHTML(JSON.stringify(op.inserted))}${op.sourcePosition!==null && op.sourcePosition!==undefined?' · source @'+op.sourcePosition:''}</span></div>`).join('')}</details></td></tr>`).join('')||'<tr><td colspan="6" class="analysis-empty">Save a checkpoint containing some text to see its words here.</td></tr>';
}
$('export-analysis').onclick=()=>{const result=MarginWordAnalysis.analyze(doc());log('tool',{tool:'export_word_analysis',checkpointId:result.checkpoint?.id});download('margin-word-analysis-'+doc().id+'.json',JSON.stringify({...result,documentId:doc().id,exportedAt:new Date().toISOString()},null,2),'application/json');};

let scoreGeneration=null;
function updateScoreDocumentLabel(){$('score-from-document').title='Export '+doc().title;}
function scoreError(error){$('score-validation').textContent='Could not parse';$('score-validation').className='score-failed';$('score-messages').textContent=error.message;$('score-final').textContent='Correct the score and preview again.';$('score-metrics').textContent='';}
function previewScore(){
 try{const result=MarginWritingScore.parse($('score-source').value);const expected=$('score-expected').value;
 $('score-final').textContent=result.text;
 $('score-metrics').textContent=`${result.text.length} UTF-16 units · ${result.events.length.toLocaleString()} events · ${(result.elapsedMs/1000).toFixed(3)} s · ${result.lossless?'Archived log':'Synthetic log'}`;
 $('score-validation').className='';
 let validation='Parsed successfully';
 if(expected){if(expected===result.text){validation='Exact text match';$('score-validation').className='score-matched';}else{let at=0;while(at<expected.length && at<result.text.length && expected[at]===result.text[at])at++;validation='Text differs at offset '+at;$('score-validation').className='score-failed';result.warnings.push('Expected '+JSON.stringify(expected.slice(at,at+35))+'; reconstructed '+JSON.stringify(result.text.slice(at,at+35))+'. Validation includes spaces and trailing newlines.');}}
 $('score-validation').textContent=validation;
 $('score-messages').textContent=result.warnings.join(' ');
 return result;
 }catch(error){scoreError(error);return null;}
}
$('score-preview').onclick=previewScore;
$('score-source').addEventListener('input',()=>{scoreGeneration=null;$('score-validation').textContent='Preview to validate changes';});
$('score-sample').onclick=()=>{$('score-source').value=MarginWritingScore.sample;$('score-expected').value=MarginWritingScore.sampleText;$('score-title').value='Writing score example';scoreGeneration=null;previewScore();};
$('score-generate').onclick=()=>{try{const generated=MarginWritingScore.generate($('score-expected').value,{seed:$('score-seed').value,edits:Number($('score-edits').value),extended:!!$('score-extended').checked});scoreGeneration=generated;$('score-source').value=generated.score;previewScore();toast('Score generated. Preview it, then create a test document.');}catch(error){scoreError(error);}};
$('score-import').onclick=()=>{
 const preview=previewScore();if(!preview)return;
 if($('score-expected').value && preview.text!==$('score-expected').value){toast('Expected text differs. Correct it or clear the expected text to import.');return;}
 try{
 const result=preview.lossless?preview:MarginWritingScore.parse($('score-source').value,{startTime:new Date(Date.now()-preview.elapsedMs).toISOString()});
 const source=result.document;
 const d=source?structuredClone(source):seedDocument($('score-title').value.trim()||'Writing score test',result.text);
 const originalId=source?.id;d.id=uid();d.title=$('score-title').value.trim()||source?.title||'Writing score test';d.text=result.text;d.comments=source?.comments?structuredClone(source.comments):[];d.revisions=source?.revisions?structuredClone(source.revisions):[];
 const revisionIds=new Map(d.revisions.map(r=>[r.id,uid()])),sessions=new Map(),sequences=new Map();
 d.events=result.events.map((event,index)=>{const e=structuredClone(event);if(!sessions.has(e.sessionId))sessions.set(e.sessionId,uid());sequences.set(e.sequence,index+1);e.originalEventId=e.id;e.originalSessionId=e.sessionId;e.originalSequence=e.sequence;e.id=uid();e.sessionId=sessions.get(e.sessionId);e.sequence=index+1;if(e.data.revisionId&&revisionIds.has(e.data.revisionId))e.data.revisionId=revisionIds.get(e.data.revisionId);return e;});
 for(const r of d.revisions){r.originalRevisionId=r.id;r.id=revisionIds.get(r.id);if(r.eventSequence)r.eventSequence=sequences.get(r.eventSequence)??0;}
 const last=d.events.at(-1),revision={id:uid(),title:'Imported final text',text:d.text,comments:structuredClone(d.comments),date:last?.timestamp||new Date().toISOString(),major:false,capturePaused:false,eventSequence:d.events.length+1};
 d.events.push({id:uid(),sequence:d.events.length+1,sessionId:last?.sessionId||uid(),timestamp:revision.date,elapsedMs:last?.elapsedMs||0,type:'checkpoint',data:{revisionId:revision.id,text:d.text,title:d.title,synthetic:!result.lossless}});d.revisions.push(revision);
 d.createdAt=source?.createdAt||d.events[0].timestamp;d.updatedAt=new Date().toISOString();d.writingScore={source:scoreGeneration?'generated':'imported',synthetic:!result.lossless,seed:scoreGeneration?.seed??null,editPasses:scoreGeneration?.edits??null,sourceDocumentId:originalId??null,warnings:result.warnings};
 state.documents.unshift(d);resetLibrary();switchDocument(d.id);setView('process');persist();toast('Test document created with a log and final checkpoint.');
 }catch(error){scoreError(error);}
};
function currentScore(){return MarginWritingScore.exportScore(doc(),{lossless:!!$('score-lossless').checked,extended:!!$('score-extended').checked});}
$('score-from-document').onclick=()=>{try{const exported=currentScore();$('score-source').value=exported.score;$('score-expected').value=doc().text;scoreGeneration=null;previewScore();if(exported.warnings.length)$('score-messages').textContent=exported.warnings.join(' ');}catch(error){scoreError(error);}};
$('score-download').onclick=()=>{try{const exported=currentScore();download((doc().title||'draft')+'.score.txt',exported.score,'text/plain');$('score-messages').textContent=exported.warnings.join(' ');}catch(error){scoreError(error);}};

$('score-portable').onclick=()=>{try{const converted=MarginWritingScore.toPortable($('score-source').value);$('score-source').value=converted.score;previewScore();$('score-messages').textContent=converted.warnings.join(' ');toast('Converted to basic writing-score notation.');}catch(error){scoreError(error);}};

function setAnalysisPresentation(presentation){
 analysisPresentation=presentation;
 $('analysis-heatmap-panel').hidden=presentation!=='heatmap';$('analysis-table-panel').hidden=presentation!=='table';
 for(const mode of ['heatmap','table']){const button=$('analysis-show-'+mode);button.classList.toggle('active',mode===presentation);button.setAttribute('aria-pressed',String(mode===presentation));}
}
$('analysis-show-heatmap').onclick=()=>{setAnalysisPresentation('heatmap');log('tool',{tool:'analysis_display',mode:'heatmap'});};
$('analysis-show-table').onclick=()=>{setAnalysisPresentation('table');log('tool',{tool:'analysis_display',mode:'table'});};
$('word-heatmap').onclick=event=>{
 const button=event.target.closest('[data-heatmap-word]');if(!button||!heatmapResult)return;
 const row=heatmapResult.rows.find(r=>r.index===Number(button.dataset.heatmapWord));if(!row)return;
 $('word-heatmap').querySelectorAll('[data-heatmap-word]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
 const score=row.purity===null?'Unknown':row.purity+'/100';
 const interval=value=>value.ms===null?'Unknown':(value.ms/1000).toFixed(3)+' s';
 $('heatmap-word-detail').innerHTML=`<div class="heatmap-detail-heading"><h3>${escapeHTML(row.word)} <small>Occurrence ${row.index}</small></h3><span class="purity-score ${row.purity===100?'pure':''}">Purity ${score}</span></div><p class="word-provenance">${escapeHTML(row.provenance)} · Characters ${row.start}–${row.end}${row.shared?' · Shared ancestry: this history may also describe another word after a split, join, or passage edit.':''}</p><div class="heatmap-pauses"><span title="${escapeHTML(row.pauseBefore.reason)}">Pause before: ${interval(row.pauseBefore)}</span><span title="${escapeHTML(row.pauseAfter.reason)}">Pause after: ${interval(row.pauseAfter)}</span></div><code class="heatmap-history">${escapeHTML(row.history||'Pre-existing / unknown')}</code>${row.operations.length?`<details class="heatmap-operations"><summary>${row.operations.length} recorded operations</summary>${row.operations.map(op=>`<div class="word-operation"><time>${escapeHTML(op.timestamp)}</time><span>${escapeHTML(op.kind)} ${escapeHTML(JSON.stringify(op.removed))} → ${escapeHTML(JSON.stringify(op.inserted))}</span></div>`).join('')}</details>`:'<p class="word-provenance">There is no recorded edit history for this occurrence.</p>'}`;
 log('tool',{tool:'heatmap_word',checkpointId:heatmapResult.checkpoint?.id,wordIndex:row.index});
};
