(function(root){
  'use strict';
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function niceStep(value){const power=10**Math.floor(Math.log10(value)),n=value/power;return(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*power;}
  function cycleBoundary(a,b){
    if(!a)return null;
    if(['profile','generation','source','window'].some(k=>typeof a[k]==='string'&&typeof b[k]==='string'&&a[k]!==b[k]))return'identity';
    if(b.reason==='reset')return'reset';
    // Gap/restart markers can mask a reset in older stored history. Recover
    // that boundary from timestamps, not from an arbitrary percentage drop.
    if(Number.isFinite(a.reset)&&Number.isFinite(b.time)&&b.time>=a.reset&&
      (Number.isFinite(b.reset)&&b.reset>a.reset+60000||b.reset===null&&b.used<a.used-.01))return'reset';
    return null;
  }
  function build(points,relative=true){
    let baseline,baselineTime,resetBaseline=false,start,last,count=0,cycle=0,hasGaps=false;
    const rows=points.map(p=>{const boundary=cycleBoundary(last,p),reset=boundary==='reset'||!start&&p.reason==='reset';if(!start||boundary){baseline=reset?0:p.used;baselineTime=reset&&Number.isFinite(last?.reset)&&last.reset<=p.time?last.reset:p.time;resetBaseline=reset;start=p;count=0;hasGaps=false;cycle++;}else if(p.segment!==last.segment&&!['change','schedule'].includes(p.reason))hasGaps=true;count++;last=p;const delta=round(p.used-baseline);return{...p,baseline,delta,cycle,resetBaseline:reset,baselineTime,value:relative?delta:p.used};});
    let min=0,max=100,ticks=[0,50,100];
    if(relative){
      const low=Math.min(0,...rows.map(p=>p.value)),high=Math.max(0,...rows.map(p=>p.value)),top=Math.max(1,Math.min(100,high*1.1)),step=niceStep(Math.max(1,top-low)/4);
      min=round(Math.floor(low/step)*step);max=round(Math.ceil(top/step)*step);ticks=[];
      for(let value=min;value<=max+step/100;value+=step)ticks.push(round(value));
    }
    return{points:rows,min,max,ticks,relative,summary:start?{start,last,count,hasGaps,baseline,baselineTime,resetBaseline,change:count>1||resetBaseline?round(last.used-baseline):null}:null};
  }
  const api={build,cycleBoundary};if(typeof module==='object'&&module.exports)module.exports=api;else root.QuotaTrendSeries=api;
})(typeof window==='object'?window:globalThis);
