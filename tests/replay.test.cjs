'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {at,render}=require('../assets/replay.js');
const event=(type,data)=>({type,data});
test('Replay tracks typing, cursor moves, backward selections and deletion',()=>{
 const events=[event('session_start',{text:'Hello world'}),event('selection',{start:11,end:11}),event('selection',{start:6,end:11,direction:'backward'}),event('before_input',{selectionStart:6,selectionEnd:11}),event('text_change',{start:6,deleteCount:5,insert:'friend',selectionStart:12,selectionEnd:12})];
 assert.equal(at(events,0).selection,null);
 assert.equal(at(events,1).selection.start,11);
 assert.deepEqual(at(events,2).selection,{start:6,end:11,direction:'backward'});
 assert.match(render(at(events,2)),/replay-caret[^]*replay-selection/);
 assert.equal(at(events,4).text,'Hello friend');
 assert.equal(at(events,4).selection.start,12);
 assert.equal(at(events,1).text,'Hello world');
});
test('Sidebar keys do not move the document caret; snapshots reset unknown positions',()=>{
 const events=[event('document_open',{text:'abc'}),event('selection',{start:2,end:2}),event('keyup',{element:'document-title',selectionStart:0,selectionEnd:0}),event('keyup',{element:'editor',selectionStart:1,selectionEnd:1}),event('revision_restore',{text:'longer'})];
 assert.equal(at(events,2).selection.start,2);
 assert.equal(at(events,3).selection.start,1);
 assert.equal(at(events,4).selection,null);
});
test('Older text edits infer a caret and invalid selections are ignored',()=>{
 const events=[event('document_open',{text:'abc'}),event('text_change',{start:1,deleteCount:1,insert:''}),event('selection',{start:-1,end:99})];
 assert.equal(at(events,2).text,'ac');assert.equal(at(events,2).selection.start,1);
});
test('Replay markup escapes typed HTML and preserves whitespace and empty text',()=>{
 const text='<script>\n & 😀';
 const html=render({text,selection:{start:0,end:8,direction:'forward'}});
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 assert.equal(html.replace(/<[^>]*>/g,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'),text);
 assert.match(render({text:'',selection:{start:0,end:0}}),/replay-caret/);
 assert.equal(render({text:'a\n',selection:null}),'a\n');
});
