const {test}=require('node:test'),assert=require('node:assert/strict'),{kind,summarize}=require('../src/ui/trend-events');
test('reset schedule updates are distinct from actual resets, corrections and missing observations',()=>{
  const a={segment:'a',used:0,reset:100};
  assert.equal(kind(a,{segment:'b',used:0,reset:200,reason:'change'}),'schedule');
  assert.equal(kind(a,{segment:'b',used:0,reset:200,reason:'reset'}),'reset');
  assert.equal(kind({...a,used:70},{segment:'b',used:0,reset:200,reason:'change'}),'change');
  assert.equal(kind(a,{segment:'b',used:0,reset:null,reason:'change'}),'change');
  assert.equal(kind(a,{segment:'b',reason:'restart'}),'gap');assert.equal(kind(a,{segment:'a',reason:'change'}),null);
});
test('dense markers are bounded by screen pixels while original samples and all boundary counts remain intact',()=>{
  const points=Array.from({length:600},(_,i)=>({time:1000+i,segment:'s'+i,reason:'change',reset:100000+i*600000,used:0})),before=JSON.stringify(points),s=summarize(points,0,2000,356);
  assert.equal(s.counts.schedule,599);assert.ok(s.markers.length<10);assert.equal(s.markers.reduce((n,m)=>n+m.count,0),599);assert.equal(JSON.stringify(points),before);
  assert.equal(summarize(points,0,0,356).markers.length,0);
});
test('actual reset markers are retained even beside a dense schedule update cluster',()=>{
  const a={time:0,segment:'a',used:1,reset:100},b={time:1,segment:'b',used:1,reset:200,reason:'change'},c={time:2,segment:'c',used:0,reset:300,reason:'reset'};
  const s=summarize([a,b,c],0,1000,356);assert.equal(s.counts.reset,1);assert.deepEqual(s.markers.map(m=>m.kind),['schedule','reset']);
});
