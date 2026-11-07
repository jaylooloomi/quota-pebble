(function(root){
 const durations={hello:4,sad:4,sleep:9,drink:7,eat:4,recharge:7};
 // Hidden local-time rhythm, shared by the title resident and lower stage.
 function rhythm(time){const hour=new Date(time).getHours(),night=hour>=22||hour<7;return{night,preferred:night?'sleep':'drink',drinkCooldown:night?1200:600};}
 function create(random=Math.random,options={}){
  const title=options.title===true,now=options.now||Date.now;let bag=[],period=rhythm(now()).night;
  const delay=()=>title?8+random()*6:35+random()*30;
  let mode='walk',elapsed=0,next=title?8+random()*6:35+random()*25,last='',drinkCooldown=0,sinceDrink=Infinity,actionDuration=0;
  function rules(){const r=rhythm(now());if(r.night!==period){period=r.night;bag=[];}drinkCooldown=Math.max(0,r.drinkCooldown-sinceDrink);return r;}
  function choose(){
   const r=rules(),available=['hello','sad','sleep','drink','recharge'].filter(x=>x!=='drink'||drinkCooldown===0),eligible=available.filter(x=>x!==last);
   const weight=x=>x===r.preferred?(r.night?4:3):1;
   if(title){
    bag=bag.filter(x=>x!=='drink'||drinkCooldown===0);
    if(!bag.length){bag=available.flatMap(x=>Array(weight(x)).fill(x));for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}}
    const index=bag.findIndex(x=>eligible.includes(x));return index<0?eligible[Math.floor(random()*eligible.length)]:bag.splice(index,1)[0];
   }
   const total=eligible.reduce((sum,x)=>sum+weight(x),0);let ticket=random()*total;
   for(const x of eligible){ticket-=weight(x);if(ticket<0)return x;}return eligible.at(-1);
  }
  return {
   act(action){if(!durations[action])return false;mode=action;elapsed=0;actionDuration=title?8+random()*6:durations[action];last=action;if(action==='drink'){drinkCooldown=rules().drinkCooldown;sinceDrink=0;}return true;},
   feed(){mode='seek';elapsed=0;},
   arrive(){if(mode==='seek'){mode='eat';elapsed=0;actionDuration=durations.eat;}},
   step(dt){dt=Math.max(0,Math.min(.1,dt));elapsed+=dt;sinceDrink+=dt;drinkCooldown=Math.max(0,drinkCooldown-dt);if(mode==='walk'){next-=dt;if(next<=0)this.act(choose());}else if(mode!=='seek'&&elapsed>=actionDuration){mode='walk';elapsed=0;next=delay();}return {mode,elapsed};}
  };
 }
 const api={create,durations,rhythm};if(typeof module==='object'&&module.exports)module.exports=api;else root.QuotaPetBehavior=api;
})(globalThis);
