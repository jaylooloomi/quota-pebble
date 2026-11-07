(function(root){
  'use strict';
  function place({width,height,tipWidth,tipHeight,selected,points=[],previous}){
    const pad=6,w=Math.min(tipWidth,Math.max(1,width-2*pad)),h=Math.min(tipHeight,Math.max(1,height-2*pad));
    const right=Math.max(pad,width-pad-w),bottom=Math.max(pad,height-pad-h);
    const candidates=[['top-left',pad,pad],['top-right',right,pad],['bottom-left',pad,bottom],['bottom-right',right,bottom]].map(([name,x,y])=>{
      const near=(p,margin=0)=>p.x>=x-margin&&p.x<=x+w+margin&&p.y>=y-margin&&p.y<=y+h+margin;
      // Avoid the inspected point first, then the visible curve. Sample at a
      // bounded stride so dense history does not make pointer movement costly.
      let density=0,total=0;const stride=Math.max(1,Math.ceil(points.length/500));
      for(let i=0;i<points.length;i+=stride){total++;if(near(points[i],3))density++;}
      const distance=Math.hypot(selected.x-(x+w/2),selected.y-(y+h/2));
      return{name,x,y,w,h,blocked:near(selected,12),score:(near(selected,12)?10000:0)+(total?density/total*100:0)-distance/Math.max(1,width)*8};
    });
    candidates.sort((a,b)=>a.score-b.score);const best=candidates[0],old=candidates.find(c=>c.name===previous);
    // A small density change must not flip the box. Never retain a blocked
    // corner when another corner clears the selected point.
    return old&&old.blocked===best.blocked&&old.score<=best.score+12?old:best;
  }
  const api={place};if(typeof module==='object'&&module.exports)module.exports=api;else root.QuotaTrendTooltip=api;
})(typeof window==='object'?window:globalThis);
