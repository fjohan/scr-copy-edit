/* Read-only checkpoint rendering. Offsets remain those of the source text. */
(function(root){
'use strict';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function band(purity){if(purity===null||!Number.isFinite(purity))return 'unknown';if(purity>=100)return 'untouched';if(purity>=50)return 'light';if(purity>=33)return 'moderate';if(purity>=25)return 'high';return 'heavy';}
function render(text,rows){let cursor=0,html='';for(const row of rows){if(!Number.isInteger(row.start)||!Number.isInteger(row.end)||row.start<cursor||row.end>text.length||row.end<=row.start)throw Error('Heatmap word offsets are invalid.');const word=text.slice(row.start,row.end);if(word!==row.word)throw Error('Heatmap words do not match their checkpoint.');const level=band(row.purity),description=row.purity===null?'History unknown':row.purity===100?'Typed once, unchanged':'Purity '+row.purity+' out of 100';const label=word+', occurrence '+row.index+'. '+description+'. '+row.provenance+'. Show word history.';html+=escape(text.slice(cursor,row.start))+`<button type="button" class="heatmap-word heat-${level}" data-heatmap-word="${row.index}" aria-pressed="false" aria-label="${escape(label)}" title="${escape(description+' · '+row.provenance)}">${escape(word)}</button>`;cursor=row.end;}return html+escape(text.slice(cursor));}
root.MarginWordHeatmap={band,render};if(typeof module!=='undefined')module.exports=root.MarginWordHeatmap;
})(typeof globalThis!=='undefined'?globalThis:window);
