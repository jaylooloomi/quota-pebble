const {test}=require('node:test'),assert=require('node:assert/strict'),{create,rhythm}=require('../src/ui/pet-behavior');
const at=hour=>new Date(2026,10,4,hour).getTime();
test('hidden rhythm switches at local 07:00/22:00 without a settings field',()=>{
 for(const h of [0,6,22,23]){assert.equal(rhythm(at(h)).preferred,'sleep');assert.equal(rhythm(at(h)).drinkCooldown,1200);}
 for(const h of [7,12,21]){assert.equal(rhythm(at(h)).preferred,'drink');assert.equal(rhythm(at(h)).drinkCooldown,600);}
});
function simulate(hour,title){let seed=1234567;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},b=create(random,{title,now:()=>at(hour)}),counts={hello:0,sad:0,sleep:0,drink:0,recharge:0},starts=[];let previous='walk',lastAction='';
 for(let i=0;i<216000;i++){const s=b.step(.1);if(s.mode!=='walk'&&previous==='walk'){counts[s.mode]++;assert.notEqual(s.mode,lastAction);lastAction=s.mode;if(s.mode==='drink')starts.push(i/10);}previous=s.mode;}
 for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=(hour===12?600:1200));return counts;
}
test('six-hour deterministic simulations show more sleep at night and more drinking by day in both locations',()=>{
 for(const title of [false,true]){const day=simulate(12,title),night=simulate(23,title);assert.ok(night.sleep>day.sleep*1.5,JSON.stringify({title,day,night}));assert.ok(day.drink>night.drink*1.5,JSON.stringify({title,day,night}));for(const action of ['hello','sad','sleep','drink','recharge']){assert.ok(day[action]>0);assert.ok(night[action]>0);}}
});
test('crossing local night/day boundary affects an existing resident without interrupting explicit actions',()=>{
 let clock=at(21);const b=create(()=>.5,{title:true,now:()=>clock});b.act('hello');clock=at(22);for(let i=0;i<79;i++)assert.equal(b.step(.1).mode,'hello');for(let i=0;i<80;i++)b.step(.1);assert.ok(['walk','hello'].includes(b.step(0).mode));assert.equal(b.act('drink'),true);assert.equal(b.act('invalid'),false);
});
test('entering night applies the longer drink cooldown to an already running resident',()=>{
 let clock=at(21);const b=create(()=>.5,{title:true,now:()=>clock});b.act('drink');clock=at(22);let previous='drink';
 for(let i=0;i<11990;i++){const s=b.step(.1);assert.ok(!(previous==='walk'&&s.mode==='drink'),'night must not reuse the daytime ten-minute cooldown');previous=s.mode;}
});
