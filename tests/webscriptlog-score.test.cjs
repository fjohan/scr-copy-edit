'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const score=require('../assets/writing-score.js');
const rendererPath='/data/html/wscr/webscriptlog/panes/linear/webscriptlog_linear.js';
const reference={};vm.createContext(reference);
// Use the live renderer when present; retain its verbatim reference functions for other machines.
vm.runInContext(fs.readFileSync(fs.existsSync(rendererPath)?rendererPath:path.join(__dirname,'fixtures/webscriptlog-linear-reference.js'),'utf8'),reference);
function check(source,expected){
 const actions=reference.parseLinearRepresentation(source);
 assert.equal(actions.some(a=>a.type==='literal-token'),false,'Renderer must recognise every exported command: '+source);
 assert.equal(reference.reconstructTextFromLinearRepresentation(source).final_text,expected);
 assert.equal(score.parse(source,{format:'webscriptlog'}).text,expected);
 if(reference.linearRepresentationToSyntheticRecords){for(const name of ['linearRepresentationToSyntheticRecords','linearRepresentationToSyntheticCheckpointRecords']){const records=reference[name](source,100000),keys=Object.keys(records.text_records).sort((a,b)=>Number(a)-Number(b));assert.equal(keys.length?records.text_records[keys.at(-1)]:'',expected,name);}}
}
test('Exports use the real renderer grammar, not Margin-only extensions',()=>{
 const inputs=['abc<LEFT@2:2>x','abc<SHIFT+LEFT@1:3:B>x','abc<CLICK0><FWD>','cat<SELECT0:3><CUT>dog<PASTE>','abc<ENTER>def<UP@2:2>x','a<LT>b<GT><TAB>','abc<CTRL+ALL@0:3>x','abc<TAP1>x','abc<SHIFT+HOME@0:3:B>x'];
 for(const input of inputs){const result=score.toWebScriptLog(input);check(result.score,score.parse(input).text);assert.doesNotMatch(result.score,/<(?:SELECT\d|MOVE|FWD|TAP|PATCH:|BASE:|PASTE:|CLIP:|RICH:)/);}
});
test('Clipboard actions are markers with explicit effects, as required by WebScriptLog',()=>{
 const result=score.toWebScriptLog('cat<SELECT0:3><CUT>dog<PASTE>');
 assert.equal(result.score,'cat<SEL0:3><CUT><DEL>dog<PASTE>cat');check(result.score,'dogcat');
});
test('Cursor resolutions use NAV and SEL and do not manufacture clicks',()=>{
 const result=score.toWebScriptLog('abc<ENTER>def<UP@1:1>x<SHIFT+LEFT@0:2:B>z');
 assert.match(result.score,/<UP><NAV1>/);assert.match(result.score,/<SEL2:0>/);assert.doesNotMatch(result.score,/<CLICK/);check(result.score,'zbc\ndef');
});
test('Snapshots, replacements, undo effects and literal control brackets remain replayable',()=>{
 const source=score.payload('BASE','cat dog')+score.payload('PATCH',{start:4,deleteCount:3,insert:'fox',inputType:'insertReplacementText'})+score.payload('PATCH',{start:0,deleteCount:3,insert:'cat!',inputType:'historyUndo'})+'<CLICK4><LT>DEL<GT>';
 const result=score.toWebScriptLog(source);assert.match(result.score,/<KEY:Snapshot>/);assert.match(result.score,/<UNDO>/);assert.equal((result.score.match(/<CLICK/g)||[]).length,1);check(result.score,score.parse(source).text);
});
test('Generated sessions reconstruct correctly in the actual renderer and both synthetic-log modes',()=>{
 const target='Writing score\n\nA café, a 🙂, and a draft with <brackets>.\n';
 for(let i=0;i<50;i++){const generated=score.generate(target,{seed:'renderer-'+i,edits:i%15,extended:true,format:'webscriptlog'});check(generated.score,target);}
});
test('Input dialect matches the target semantics, including inert markers and count deletion',()=>{
 for(const source of ['abc<HOME>x','abc<ENTER>def<UP>x','abc<SEL3:1><SLEFT>x','abc<SEL1:3><DEL2>','abc<SELECTALL>x','abc<CUT>x','abc<PASTE>x','abc<FDEL>','abc<LEFT_TO_START>x','abc<KEY:Control+Left><NAV0>x','abc<SELECT0:1>'])assert.equal(score.parse(source,{format:'webscriptlog'}).text,reference.reconstructTextFromLinearRepresentation(source).final_text,source);
});
test('Import and export of WebScriptLog scores, followed by live typing, still reconstruct',()=>{
 const source='abc<0.5><HOME>x<SEL1:3>yz<RIGHT_TO_END><0.2>',parsed=score.parse(source,{format:'webscriptlog'}),d={text:parsed.text,events:parsed.events,comments:[],revisions:[]};
 let output=score.exportScore(d,{format:'webscriptlog'});check(output.score,d.text);
 d.events.push({id:'live',sessionId:'s-live',sequence:d.events.length+1,timestamp:'2026-01-01T00:00:01.000Z',elapsedMs:0,type:'text_change',data:{start:d.text.length,deleteCount:0,insert:'!',inputType:'insertText'}});d.text+='!';
 output=score.exportScore(d,{format:'webscriptlog'});check(output.score,d.text);
});
test('Generated WebScriptLog clipboard markers retain useful move ancestry when imported',()=>{
 const {analyze}=require('../assets/word-analysis.js');
 const generated=score.generate('one two three four',{seed:'moves',edits:5,format:'webscriptlog'}),parsed=score.parse(generated.score,{format:'webscriptlog'});
 const d={text:parsed.text,events:parsed.events,comments:[],revisions:[{id:'r',title:'Final',text:parsed.text,eventSequence:parsed.events.length,date:parsed.events.at(-1).timestamp}]};
 assert.ok(analyze(d).rows.some(row=>row.history.includes('M←')));
 check(score.exportScore(d,{format:'webscriptlog'}).score,d.text);
});
test('Pauses retain millisecond resolution and no unknown tokens leak as literal prose',()=>{
 const original='a<0.123456>b<0.5><LEFT@1:1>c<1.001>',result=score.toWebScriptLog(original),parsed=score.parse(original),actions=reference.parseLinearRepresentation(result.score);
 assert.equal(Math.round(actions.filter(a=>a.command==='PAUSE').reduce((sum,a)=>sum+a.seconds*1000,0)),parsed.elapsedMs);check(result.score,parsed.text);
});
