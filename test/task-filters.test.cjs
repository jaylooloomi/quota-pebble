const {test}=require('node:test'),assert=require('node:assert/strict');
const {matches,order}=require('../src/ui/task-filters');
test('task date ranges use local calendar days, include the boundary and exclude unknown/future times',()=>{
  const now=new Date(2026,10,3,14,30).getTime(),at=(d,h=0)=>new Date(2026,10,d,h).getTime();
  assert.deepEqual(order,['running','today','threeDays','fiveDays','week','idle','waiting','unknown','all']);
  for(const [filter,day] of [['today',3],['threeDays',1],['fiveDays',-1],['week',-3]]){
    const start=at(day);assert.equal(matches({confirmedAt:start},filter,now),true);
    assert.equal(matches({confirmedAt:start-1},filter,now),false);
    assert.equal(matches({confirmedAt:now},filter,now),true);
    for(const time of [null,undefined,NaN,Infinity,0,now+1])assert.equal(matches({confirmedAt:time},filter,now),false);
  }
  assert.equal(matches({confirmedAt:at(2,23)},'today',now),false);
});
test('status filters stay independent from age and date filters include every status',()=>{
  const now=Date.now();for(const status of ['running','idle','waiting','unknown']){
    assert.equal(matches({status,confirmedAt:now},'today',now),true);
    assert.equal(matches({status,confirmedAt:null},status,now),true);
    assert.equal(matches({status,confirmedAt:null},'all',now),true);
    assert.equal(matches({status},status==='running'?'waiting':'running',now),false);
  }
});

test('eight-hour summary uses a rolling window, not calendar midnight',()=>{const now=new Date(2026,10,3,3).getTime(),start=now-8*3600000;assert.equal(matches({confirmedAt:start},'eightHours',now),true);assert.equal(matches({confirmedAt:start-1},'eightHours',now),false);assert.equal(matches({confirmedAt:now},'eightHours',now),true);for(const t of [null,NaN,Infinity,0,now+1])assert.equal(matches({confirmedAt:t},'eightHours',now),false);});
