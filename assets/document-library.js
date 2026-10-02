/* Search and sort a view of the library without changing stored document order. */
(function(root){
'use strict';
const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
function select(documents,{query='',filter='all',sort='recent'}={}){
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 const result=documents.filter(d=>{const isTest=!!d.writingScore;if(filter==='tests'&&!isTest||filter==='writing'&&isTest)return false;if(!terms.length)return true;const searchable=normalize((d.title||'Untitled')+' '+(d.text||''));return terms.every(term=>searchable.includes(term));});
 const time=d=>Date.parse(d.updatedAt||d.createdAt)||0;
 return result.sort((a,b)=>sort==='name'?(a.title||'Untitled').localeCompare(b.title||'Untitled',undefined,{numeric:true,sensitivity:'base'}):sort==='oldest'?time(a)-time(b):time(b)-time(a));
}
root.MarginDocumentLibrary={select};if(typeof module!=='undefined')module.exports=root.MarginDocumentLibrary;
})(typeof globalThis!=='undefined'?globalThis:window);
