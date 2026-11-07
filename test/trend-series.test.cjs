const {test}=require('node:test'),assert=require('node:assert/strict'),{build}=require('../src/ui/trend-series');
const p=(used,segment='a',time=0)=>({used,segment,time});
test('relative chart uses percentage point deltas, explicit positive ticks and headroom',()=>{
  const input=[p(70),p(71),p(73),p(76)],before=JSON.stringify(input),s=build(input);
  assert.deepEqual(s.points.map(p=>p.value),[0,1,3,6]);assert.deepEqual(s.ticks,[0,2,4,6,8]);assert.equal(s.summary.start.used,70);assert.equal(s.summary.last.used,76);assert.equal(s.summary.change,6);assert.equal(JSON.stringify(input),before);
});
test('only a confirmed reset rebases; same-cycle gaps preserve their baseline and net increase',()=>{
  const s=build([p(70,'a'),p(80,'a'),{...p(4,'reset'),reason:'reset'},p(9,'reset'),{...p(30,'gap'),reason:'gap'},p(32,'gap')]);
  assert.deepEqual(s.points.map(p=>p.value),[0,10,4,9,30,32]);assert.equal(s.summary.change,32);assert.equal(s.summary.baseline,0);assert.equal(s.summary.start.used,4);assert.equal(s.summary.hasGaps,true);
});
test('restart, schedule shifts and corrections do not invent new quota cycles',()=>{
 const s=build([{...p(68,'a',1),reset:10000},{...p(72,'b',2),reason:'restart',reset:10000},{...p(78,'c',3),reason:'change',reset:20000},{...p(77,'d',4),reason:'change',reset:20000}]);
 assert.deepEqual(s.points.map(p=>p.delta),[0,4,10,9]);assert.equal(s.summary.change,9);assert.equal(s.summary.hasGaps,true);
});
test('older gaps masking an elapsed reset and identity changes start fresh baselines',()=>{
 const s=build([{...p(78,'a',100000),reset:200000,generation:'old'},{...p(2,'b',250000),reset:500000,reason:'gap',generation:'old'},{...p(5,'b',260000),reset:500000,generation:'old'},{...p(50,'c',270000),reset:500000,generation:'new'}]);
 assert.deepEqual(s.points.map(p=>p.delta),[0,2,5,0]);assert.equal(s.summary.change,null);assert.equal(s.summary.hasGaps,false);
});
test('confirmed reset starts at zero even if the first observed post-reset reading already used quota',()=>{
 const s=build([{...p(70,'a',100000),reset:200000},p(78,'a',190000),{...p(2,'b',250000),reason:'reset',reset:500000},p(5,'b',260000)]);
 assert.deepEqual(s.points.map(p=>p.delta),[0,8,2,5]);assert.equal(s.summary.baseline,0);assert.equal(s.summary.change,5);assert.equal(s.summary.resetBaseline,true);
 const one=build([{...p(2,'b',250000),reason:'reset',reset:500000}]);assert.equal(one.summary.change,2);assert.equal(one.summary.baseline,0);
 const pending=build([{...p(78,'a',100000),reset:200000},p(81,'a',190000)]);assert.equal(pending.summary.change,3,'future reset time must not zero real current usage');
});
test('flat, single-point, empty and fractional series remain honest and finite',()=>{
  assert.equal(build([p(0),p(0)]).summary.change,0);assert.equal(build([p(76)]).summary.change,null);assert.equal(build([]).summary,null);
  const tiny=build([p(12.34),p(12.36)]);assert.equal(tiny.summary.change,.02);assert.ok(tiny.max>=1);
  const full=build([p(0),p(100)]);assert.equal(full.max,100);assert.ok(full.ticks.every(Number.isFinite));
});
test('absolute mode retains actual quota percentages with fixed 0–100% scale',()=>{
  const s=build([p(70),p(76)],false);assert.deepEqual(s.points.map(p=>p.value),[70,76]);assert.deepEqual(s.ticks,[0,50,100]);assert.equal(s.summary.change,6);
});
