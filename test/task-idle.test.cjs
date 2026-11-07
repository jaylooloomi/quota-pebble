const {test}=require('node:test'),assert=require('node:assert/strict');
const {IdleTracker}=require('../dist/task-idle');
const base=new Date(2026,10,4,12).getTime();
test('diagnostic counters explain baseline suppression, pending gates, eligibility and successful-completion priority',()=>{
 const f=fixture(),{tracker:t,row:r}=f;t.observe([r('idle')]);assert.equal(t.diagnostics().decisions['claude:baseline_nonrunning'],1);f.set(1000);t.observe([r('running')]);f.set(5000);t.observe([r('idle')]);assert.equal(t.diagnostics().pending,1);f.set(20000);t.observe([r('idle')]);f.set(35000);assert.equal(t.observe([r('idle')]).length,1);assert.equal(t.diagnostics().decisions['claude:eligible'],1);
 f.set(40000);t.observe([r('running')]);f.set(41000);t.completion('a');t.observe([r('idle')]);assert.equal(t.diagnostics().decisions['claude:completed_priority'],1);assert.equal(t.diagnostics().pending,0);
});
function fixture(){let now=base;const tracker=new IdleTracker(()=>now);const row=(status,id='a',provider='claude',extra={})=>({id,provider,title:'Test task',host:'PC',status,source:'claude-registry',observedAt:now,confirmedAt:now,...extra});return{tracker,row,set:n=>now=base+n,at:()=>now};}

test('Antigravity remote minute polling requires two fresh idle observations and suppresses startup idle',()=>{
 const f=fixture(),r=status=>f.row(status,'remote-a','antigravity',{source:'antigravity-remote'});
 f.tracker.observe([r('idle')]);f.set(60000);assert.deepEqual(f.tracker.observe([r('idle')]),[]);
 f.set(120000);f.tracker.observe([r('running')]);f.set(180000);const cached=r('idle');assert.deepEqual(f.tracker.observe([cached]),[]);
 f.set(220000);assert.deepEqual(f.tracker.observe([cached]),[]);f.set(240000);assert.equal(f.tracker.observe([r('idle')]).length,1);
 f.set(300000);assert.deepEqual(f.tracker.observe([r('idle')]),[]);
});
test('all three providers require a running → idle transition stable for 30s and two fresh observations',()=>{
 for(const provider of ['codex','claude','antigravity']){const f=fixture(),{tracker:t,row:r}=f;t.observe([r('running','a',provider)]);f.set(5000);assert.deepEqual(t.observe([r('idle','a',provider)]),[]);f.set(20000);t.observe([r('idle','a',provider)]);f.set(34999);assert.deepEqual(t.observe([r('idle','a',provider)]),[]);f.set(35000);const n=t.observe([r('idle','a',provider)]);assert.equal(n.length,1);assert.equal(n[0].kind,'idle');assert.equal(n[0].provider,provider);f.set(45000);assert.deepEqual(t.observe([r('idle','a',provider)]),[]);}
});
test('baseline idle, duplicate cached snapshots, disconnect, missing rows and long scan gaps never announce old idle',()=>{
 const f=fixture(),{tracker:t,row:r}=f;t.observe([r('idle')]);f.set(10000);assert.deepEqual(t.observe([r('idle')]),[]);
 f.set(20000);t.observe([r('running')]);f.set(25000);const cached=r('idle');t.observe([cached]);f.set(60000);assert.deepEqual(t.observe([cached]),[]);assert.deepEqual(t.observe([r('idle')]),[]);
 f.set(65000);t.observe([r('running')]);f.set(70000);t.observe([r('unknown')]);f.set(75000);t.observe([r('idle')]);f.set(90000);assert.deepEqual(t.observe([r('idle')]),[]);
 f.set(95000);t.observe([r('running')]);t.observe([]);f.set(100000);assert.deepEqual(t.observe([r('idle')]),[]);
});
test('same-task 10min cooldown remains while simultaneous different tasks are passed to batching',()=>{
 const f=fixture(),{tracker:t,row:r}=f;t.observe([r('running','a'),r('running','b')]);f.set(5000);t.observe([r('idle','a'),r('idle','b')]);f.set(20000);t.observe([r('idle','a'),r('idle','b')]);f.set(35000);assert.equal(t.observe([r('idle','a'),r('idle','b')]).length,2);
 f.set(45000);t.observe([r('running','a'),r('idle','b')]);f.set(50000);t.observe([r('idle','a'),r('idle','b')]);f.set(65000);t.observe([r('idle','a'),r('idle','b')]);f.set(80000);assert.deepEqual(t.observe([r('idle','a'),r('idle','b')]),[]);
 f.set(640000);t.observe([r('running','a')]);f.set(645000);t.observe([r('idle','a')]);f.set(660000);t.observe([r('idle','a')]);f.set(675000);assert.equal(t.observe([r('idle','a')]).length,1);
});
test('successful completion suppresses idle for that activity, but not a later running cycle',()=>{
 const f=fixture(),{tracker:t,row:r}=f;t.observe([r('running')]);f.set(5000);t.completion('a');t.observe([r('idle')]);f.set(20000);t.observe([r('idle')]);f.set(35000);assert.deepEqual(t.observe([r('idle')]),[]);
 f.set(40000);t.observe([r('running')]);f.set(45000);t.observe([r('idle')]);f.set(60000);t.observe([r('idle')]);f.set(75000);assert.equal(t.observe([r('idle')]).length,1);
});
test('waiting, disabled/paused, stale and invalid observation times reset transition baselines',()=>{
 for(const interrupt of ['waiting','disabled','stale','future']){const f=fixture(),{tracker:t,row:r}=f;t.observe([r('running')]);f.set(5000);t.observe([r('idle')]);f.set(10000);if(interrupt==='disabled')t.observe([r('idle')],false);else t.observe([r(interrupt==='waiting'?'waiting':'idle','a','claude',{observedAt:interrupt==='stale'?base-30000:interrupt==='future'?base+100000:f.at()})]);f.set(20000);t.observe([r('idle')]);f.set(35000);assert.deepEqual(t.observe([r('idle')]),[]);}
});
test('midnight and provider/host isolation do not combine unrelated running and idle observations',()=>{
 const f=fixture(),{tracker:t,row:r}=f;t.observe([r('running')]);f.set(5000);assert.deepEqual(t.observe([r('idle','a','antigravity')]),[]);f.set(20000);t.observe([r('idle','a','antigravity')]);f.set(35000);assert.deepEqual(t.observe([r('idle','a','antigravity')]),[]);
 const g=fixture();g.tracker.observe([g.row('running')]);g.set(86400000);assert.deepEqual(g.tracker.observe([g.row('idle')]),[]);
});
