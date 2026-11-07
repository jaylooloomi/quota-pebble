(function(root){
  'use strict';
  const series=typeof module==='object'&&module.exports?require('./trend-series'):root.QuotaTrendSeries;
  function kind(a,b){
    if(a&&series.cycleBoundary(a,b)==='reset')return'reset';
    if(!a||a.segment===b.segment)return null;
    if(b.reason==='reset')return'reset';
    if(b.reason==='change')return Number.isFinite(a.reset)&&Number.isFinite(b.reset)&&a.reset!==b.reset&&b.used>=a.used-.01?'schedule':'change';
    return'gap';
  }
  function summarize(points,from,to,width){
    const counts={reset:0,change:0,schedule:0,gap:0},markers=[];
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||!Number.isFinite(width)||width<=0)return{counts,markers};
    const last=new Map();
    for(let i=1;i<points.length;i++){
      const p=points[i],k=kind(points[i-1],p);if(!k)continue;counts[k]++;
      if(k==='gap')continue;
      const x=Math.max(0,Math.min(width,(p.time-from)/(to-from)*width)),prior=last.get(k);
      // Thin annotations are grouped by screen distance, not by deleting or
      // joining the historical samples/segments beneath them.
      if(prior&&x-prior.x<14){prior.count++;prior.end=p.time;continue;}
      const marker={kind:k,x,time:p.time,end:p.time,count:1};markers.push(marker);last.set(k,marker);
    }
    return{counts,markers};
  }
  const api={kind,summarize};if(typeof module==='object'&&module.exports)module.exports=api;else root.QuotaTrendEvents=api;
})(typeof window==='object'?window:globalThis);
