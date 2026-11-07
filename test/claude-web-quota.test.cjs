const {test}=require('node:test'),assert=require('node:assert/strict');
const {ClaudeWebQuota}=require('../dist/claude-web-quota');
test('web plan uses source fields rather than display names',()=>{const {claudeWebPlan}=require('../dist/claude-web-quota');assert.equal(claudeWebPlan({rate_limit_tier:'default_claude_teams'}),'Team');assert.equal(claudeWebPlan({name:'My Pro Team'}),null);assert.equal(claudeWebPlan({rate_limit_tier:'default_claude_max_20x'}),'Max');});
const org='12345678-1234-1234-1234-123456789abc';
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
function fixture(extra={}){const calls=[];const source=new ClaudeWebQuota(async(url,init)=>{calls.push(url);assert.equal(init.credentials,'include');assert.equal(init.redirect,'error');const route=new URL(url).pathname;if(extra.respond)return extra.respond(route,calls.length);return json(route==='/api/account'?{uuid:'account-a'}:route==='/api/organizations'?[{uuid:org,name:'Team'}]:{five_hour:{utilization:12,resets_at:'2026-11-07T01:00:00Z'},limits:[{kind:'weekly_scoped',scope:{model:{display_name:'Fable'}},percent:20}]});},()=>1000);return{source,calls};}
test('web quota uses verified account and organization, includes model windows, caches without extra calls',async()=>{const {source,calls}=fixture();const r=await source.read(org);assert.deepEqual(r.windows.map(w=>w.usedPercent),[20,12]);assert.match(r.identityKey,/^[a-f0-9]{64}$/);assert.equal(calls.length,4);await source.read(org);assert.equal(calls.length,4);});
test('web quota reads plan details from the selected organization membership only',async()=>{
 const other={organization:{uuid:'other-org',organization_type:'claude_max'},seat_tier:'team_premium'};
 for(const [membership,expected] of [
  [{organization:{uuid:org,rate_limit_tier:'default_claude_teams'}},'Team'],
  [{organization:{uuid:org},seat_tier:'team_standard'},'Team'],
  [{organization:{uuid:org,name:'Team'}},null],
  [null,null],
 ]){
  const {source,calls}=fixture({respond:route=>json(route==='/api/account'
   ?{uuid:'account-a',memberships:[other,...(membership?[membership]:[])]}
   :route==='/api/organizations'?[{uuid:org}]:{five_hour:{utilization:12}})});
  assert.equal((await source.read(org)).plan,expected);
  assert.equal(calls.length,4);
 }
});
test('rejects organization route injection without network',async()=>{const {source,calls}=fixture();await assert.rejects(source.read('../account'));assert.equal(calls.length,0);});
test('429 establishes cooldown and does not request another endpoint',async()=>{const {source,calls}=fixture({respond:()=>new Response('',{status:429,headers:{'retry-after':'3600'}})});await assert.rejects(source.read(org),e=>e.code==='rate_limit'&&e.retryAfterMs===3600000);await assert.rejects(source.read(org));assert.equal(calls.length,1);});
test('403 challenge stops without login loops or HTML parsing',async()=>{const {source,calls}=fixture({respond:()=>new Response('challenge',{status:403})});await assert.rejects(source.read(org),e=>e.code==='auth');assert.equal(calls.length,1);});
test('unrelated organization never requests usage',async()=>{const {source,calls}=fixture({respond:route=>json(route==='/api/account'?{uuid:'a'}:[])});await assert.rejects(source.read(org),e=>e.code==='auth');assert.equal(calls.length,2);});
test('account switch during query never publishes a reading',async()=>{let accounts=0;const {source}=fixture({respond:route=>json(route==='/api/account'?{uuid:++accounts===1?'a':'b'}:route==='/api/organizations'?[{uuid:org}]:{five_hour:{utilization:12}})});await assert.rejects(source.read(org),e=>e.code==='auth');});
test('HTML and oversized payloads do not become quota data',async()=>{for(const response of [new Response('<html>login</html>',{headers:{'content-type':'text/html'}}),new Response('x'.repeat(1024*1024+1),{headers:{'content-type':'application/json'}})]){const {source}=fixture({respond:()=>response});await assert.rejects(source.read(org),e=>e.code==='schema');}});
