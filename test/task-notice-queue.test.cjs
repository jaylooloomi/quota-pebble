const {test}=require('node:test'),assert=require('node:assert/strict'),{TaskNoticeQueue}=require('../dist/task-notice-queue');
const item=(id,kind='completed',turnId='turn')=>({id,kind,turnId,title:'Task '+id,provider:'codex',host:'PC',time:1000});
test('two-second collection batches up to three and keeps remaining notifications in arrival order',()=>{
 let now=1000;const q=new TaskNoticeQueue(()=>now);q.enqueue(item('a'));now=1500;q.enqueue(item('b'));q.enqueue(item('c'));q.enqueue(item('d'));assert.equal(q.start(),false);now=2999;assert.equal(q.start(),false);now=3000;assert.equal(q.start(),true);assert.deepEqual(q.active.map(v=>v.id),['a','b','c']);assert.equal(q.waiting,1);q.dismiss();assert.equal(q.delay(),500);now=3500;q.start();assert.deepEqual(q.active.map(v=>v.id),['d']);
});
test('viewing one item and replacing idle with completion preserve unrelated active and queued rows',()=>{
 let now=0;const q=new TaskNoticeQueue(()=>now);q.enqueue(item('a','idle','idle-1'));q.enqueue(item('b'));q.enqueue(item('c'));q.enqueue(item('d'));now=2000;q.start();assert.equal(q.enqueue(item('a','completed','done')),'updated');assert.equal(q.active[0].kind,'completed');assert.equal(q.enqueue(item('a','idle','idle-2')),'duplicate');assert.equal(q.take('wrong'),undefined);assert.equal(q.take('b').id,'b');assert.deepEqual(q.active.map(v=>v.id),['a','c']);assert.equal(q.waiting,1);q.dismiss();q.start();assert.equal(q.active[0].id,'d');
});
test('deduplication survives dismissal, overflow is counted visibly, clear is explicit',()=>{
 let now=0;const q=new TaskNoticeQueue(()=>now,2);assert.equal(q.enqueue(item('a')),'queued');q.enqueue(item('b'));assert.equal(q.enqueue(item('c')),'overflow');assert.equal(q.waiting,3);now=2000;q.start();q.dismiss();assert.equal(q.enqueue(item('a')),'duplicate');q.start();assert.equal(q.activeOverflow,1);assert.equal(q.active.length,0);assert.equal(q.hasActive,true);q.clear();assert.equal(q.waiting,0);assert.equal(q.hasActive,false);
});
test('new events outside the first collection window wait for their own two-second window',()=>{
 let now=0;const q=new TaskNoticeQueue(()=>now);q.enqueue(item('a'));now=2500;q.enqueue(item('b'));q.start();assert.deepEqual(q.active.map(v=>v.id),['a']);q.dismiss();assert.equal(q.delay(),2000);now=4500;q.start();assert.equal(q.active[0].id,'b');
});
