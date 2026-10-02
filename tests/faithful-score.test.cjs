'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const score=require('../assets/writing-score.js');
function document(text,actions){return {text,comments:[],revisions:[],events:actions.map(([type,data,ms=0],i)=>({id:'e'+i,sequence:i+1,sessionId:'s',elapsedMs:ms,timestamp:new Date(Date.UTC(2026,0,1)+ms).toISOString(),type,data}))};}
const initial=['session_start',{text:''},0];
test('Typing and backspace move the score cursor without synthetic clicks or selections',()=>{
 const d=document('ac',[initial,['text_change',{start:0,deleteCount:0,insert:'a',inputType:'insertText'},100],['selection',{start:1,end:1},110],['text_change',{start:1,deleteCount:0,insert:'b',inputType:'insertText'},200],['selection',{start:2,end:2},210],['text_change',{start:1,deleteCount:1,insert:'',inputType:'deleteContentBackward'},500],['selection',{start:1,end:1},510],['text_change',{start:1,deleteCount:0,insert:'c',inputType:'insertText'},800]]);
 const exported=score.exportScore(d);assert.equal(exported.score,'<0.1>a<0.1>b<0.3><DEL><0.3>c');assert.equal(score.parse(exported.score).text,'ac');
});
test('Older keyboard logs retain arrow actions and coalesce their selection notifications',()=>{
 const d=document('ac',[initial,['text_change',{start:0,deleteCount:0,insert:'abc',inputType:'insertText'},100],['keydown',{element:'editor',key:'ArrowLeft'},200],['selection',{start:2,end:2},210],['keyup',{element:'editor',key:'ArrowLeft',selectionStart:2,selectionEnd:2},220],['text_change',{start:1,deleteCount:1,insert:'',inputType:'deleteContentBackward'},300]]);
 const exported=score.exportScore(d);assert.match(exported.score,/<LEFT@2:2>/);assert.doesNotMatch(exported.score,/<(?:CLICK|MOVE|SELECT)/);assert.equal(score.parse(exported.score).text,'ac');
});
test('Recorded pointer and keyboard actions keep provenance, modifiers, direction and press timing',()=>{
 const d=document('axc',[initial,['text_change',{start:0,deleteCount:0,insert:'abc',inputType:'insertText'},100],['keydown',{element:'editor',key:'ArrowLeft'},200],['selection',{start:1,end:2,direction:'backward'},210],['navigation',{source:'keyboard',key:'ArrowLeft',shift:true,start:1,end:2,direction:'backward',actionElapsedMs:200,actionTimestamp:'2026-01-01T00:00:00.200Z'},211],['keyup',{element:'editor',key:'ArrowLeft',shift:true,selectionStart:1,selectionEnd:2},250],['text_change',{start:1,deleteCount:1,insert:'x',inputType:'insertText'},300],['navigation',{source:'touch',start:0,end:0},400],['navigation',{source:'pointer',start:0,end:0},500]]);
 const exported=score.exportScore(d);assert.equal(exported.score,'<0.1>abc<0.1><SHIFT+LEFT@1:2:B><0.1>x<0.1><TAP0><0.1><CLICK0>');assert.equal(score.parse(exported.score).text,'axc');
});
test('Forward delete, selection replacement and clipboard edits keep their action types',()=>{
 const d=document('dogcat',[initial,['text_change',{start:0,deleteCount:0,insert:'cat dog',inputType:'insertText'},100],['selection',{start:0,end:3},200],['cut',{selectionStart:0,selectionEnd:3,selectedText:'cat'},220],['text_change',{start:0,deleteCount:3,insert:'',inputType:'deleteByCut'},221],['navigation',{source:'pointer',start:0,end:0},300],['text_change',{start:0,deleteCount:1,insert:'',inputType:'deleteContentForward'},400],['navigation',{source:'touch',start:3,end:3},500],['paste',{selectionStart:3,selectionEnd:3},600],['text_change',{start:3,deleteCount:0,insert:'cat',inputType:'insertFromPaste'},601]]);
 const exported=score.exportScore(d);assert.match(exported.score,/<CUT>/);assert.doesNotMatch(exported.score,/<DEL/);assert.match(exported.score,/<FWD>/);assert.match(exported.score,/<PASTE:/);assert.equal(score.parse(exported.score).text,'dogcat');
});
test('Missing navigation preserves an edit as PATCH rather than fabricating a click',()=>{
 const d=document('axb',[initial,['text_change',{start:0,deleteCount:0,insert:'ab',inputType:'insertText'},100],['text_change',{start:1,deleteCount:0,insert:'x',inputType:'insertText'},200]]);
 const exported=score.exportScore(d);assert.match(exported.score,/<PATCH:/);assert.doesNotMatch(exported.score,/<CLICK/);assert.ok(exported.warnings.some(w=>w.includes('no matching recorded navigation')));assert.equal(score.parse(exported.score).text,'axb');
});
test('A recorded cut without a resulting edit does not fabricate deletion',()=>{
 const d=document('cat',[initial,['text_change',{start:0,deleteCount:0,insert:'cat',inputType:'insertText'},100],['selection',{start:0,end:3},200],['cut',{selectionStart:0,selectionEnd:3},300]]);
 const exported=score.exportScore(d);assert.equal(score.parse(exported.score).text,'cat');assert.doesNotMatch(exported.score,/<(?:DEL|CUT>|BASE)/);assert.ok(exported.warnings.some(w=>w.includes('no recorded deletion')));
});
test('Repeated navigation keys remain separate actions and keyup is not duplicated',()=>{
 const d=document('abc',[initial,['text_change',{start:0,deleteCount:0,insert:'abc',inputType:'insertText'},100],['keydown',{element:'editor',key:'ArrowLeft'},200],['navigation',{source:'keyboard',key:'ArrowLeft',start:2,end:2},201],['keydown',{element:'editor',key:'ArrowLeft',repeat:true},300],['navigation',{source:'keyboard',key:'ArrowLeft',repeat:true,start:1,end:1},301],['keyup',{element:'editor',key:'ArrowLeft',selectionStart:1,selectionEnd:1},350]]);
 const exported=score.exportScore(d);assert.equal((exported.score.match(/<LEFT@/g)||[]).length,2);assert.equal(score.parse(exported.score).cursor,1);assert.doesNotMatch(exported.score,/<CLICK/);
});
test('A score can be authored with keyboard navigation, selection, deletion and pauses',()=>{
 assert.equal(score.parse('<1>cat<LEFT><0.25>x<RIGHT><DEL>').text,'cax');
 assert.equal(score.parse('cat<SHIFT+LEFT><SHIFT+LEFT>ox').text,'cox');
 assert.equal(score.parse('abc<HOME><FWD>').text,'bc');
 assert.equal(score.parse('abc<ENTER>def<UP>X').text,'abcX\ndef');
 assert.equal(score.parse('🙂<LEFT>x').text,'x🙂');
 assert.equal(score.parse('abc<CTRL+ALL>x').text,'x');
 assert.throws(()=>score.parse('abc<CTRL+LEFT>'),/recorded target/);
 assert.throws(()=>score.parse('abc<LEFT@9:9>'),/outside/);
});
test('Faithful score roundtrips action tokens and portable mode remains explicit',()=>{
 const source='abc<0.5><LEFT><SHIFT+LEFT@1:2:B>x<TAP0><FWD><0.2>';
 const r=score.parse(source),d={...r,comments:[],revisions:[]};
 assert.equal(score.exportScore(d).score,source);
 const basic=score.exportScore(d,{portable:true});assert.equal(score.parse(basic.score).text,r.text);assert.ok(basic.warnings.some(w=>w.includes('synthesize CLICK')));
});
