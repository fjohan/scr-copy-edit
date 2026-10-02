/* Reconstruct text and the recorded editor selection at an event boundary. */
(function(root){
'use strict';
function at(events,index,title=''){
 let text='',selection=null;
 for(let i=0;i<=index&&i<events.length;i++){
  const e=events[i],d=e.data||{};
  if(typeof d.text==='string'){text=d.text;selection=null;}
  if(e.type==='text_change'){
   text=text.slice(0,d.start)+d.insert+text.slice(d.start+d.deleteCount);
   selection={start:d.start+d.insert.length,end:d.start+d.insert.length,direction:'none'};
  }
  if(d.title!==undefined)title=d.title;
  let start,end,direction;
  if(e.type==='selection'||e.type==='navigation'){start=d.start;end=d.end;direction=d.direction;}
  else if(['before_input','text_change','compositionstart','compositionend','paste','cut','copy'].includes(e.type)||(['keydown','keyup'].includes(e.type)&&d.element==='editor')){
   start=d.selectionStart;end=d.selectionEnd;direction=d.selectionDirection;
  }
  if(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>=start&&end<=text.length)selection={start,end,direction:direction==='backward'?'backward':'forward'};
 }
 return {text,title,selection};
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render({text,selection}){
 if(!selection)return escape(text);
 const {start,end,direction}=selection,caret='<span class="replay-caret" aria-hidden="true"></span>';
 if(start===end)return escape(text.slice(0,start))+caret+escape(text.slice(end));
 return escape(text.slice(0,start))+(direction==='backward'?caret:'')+'<mark class="replay-selection">'+escape(text.slice(start,end))+'</mark>'+(direction==='backward'?'':caret)+escape(text.slice(end));
}
root.MarginReplay={at,render};if(typeof module!=='undefined')module.exports=root.MarginReplay;
})(typeof globalThis!=='undefined'?globalThis:window);
