/* Use the pre-input selection where possible, especially for repeated letters. */
(function(root){
'use strict';
function diff(oldText,newText,hint=null){
 if(oldText===newText)return {start:0,deleteCount:0,insert:''};
 if(hint && Number.isInteger(hint.selectionStart) && Number.isInteger(hint.selectionEnd) && !/historyUndo|historyRedo/.test(hint.inputType||'')){
  let start=hint.selectionStart,end=hint.selectionEnd;
  if(start>=0 && end>=start && end<=oldText.length){
   if(start===end && newText.length<oldText.length){const removed=oldText.length-newText.length;if(/Backward/.test(hint.inputType||''))start-=removed;else if(/Forward/.test(hint.inputType||''))end+=removed;}
   const length=newText.length-(oldText.length-(end-start));
   if(start>=0 && end<=oldText.length && length>=0){const insert=newText.slice(start,start+length);if(oldText.slice(0,start)+insert+oldText.slice(end)===newText)return {start,deleteCount:end-start,insert};}
  }
 }
 let start=0;while(start<oldText.length && start<newText.length && oldText[start]===newText[start])start++;
 let oldEnd=oldText.length,newEnd=newText.length;while(oldEnd>start && newEnd>start && oldText[oldEnd-1]===newText[newEnd-1]){oldEnd--;newEnd--;}
 return {start,deleteCount:oldEnd-start,insert:newText.slice(start,newEnd)};
}
root.MarginTextEdits={diff};if(typeof module!=='undefined')module.exports=root.MarginTextEdits;
})(typeof globalThis!=='undefined'?globalThis:window);
