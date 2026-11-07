const {test}=require('node:test'),assert=require('node:assert/strict'),{place}=require('../src/ui/trend-tooltip');
test('right-upper inspected point prefers empty lower-left; no connector or chart geometry is needed',()=>{
 const r=place({width:400,height:172,tipWidth:210,tipHeight:70,selected:{x:390,y:20},points:[{x:390,y:20},{x:80,y:30},{x:160,y:30},{x:250,y:25}]});assert.equal(r.name,'bottom-left');assert.equal(r.blocked,false);
});
test('selected point safety overrides hysteresis, but small curve-density changes keep a stable corner',()=>{
 const args={width:400,height:200,tipWidth:150,tipHeight:60,selected:{x:390,y:20},points:[]};const a=place({...args,previous:'bottom-left'});assert.equal(a.name,'bottom-left');const b=place({...args,selected:{x:40,y:170},previous:a.name});assert.notEqual(b.name,'bottom-left');assert.equal(b.blocked,false);
});
test('all four corners, narrow charts and tall tooltips stay bounded with finite positions',()=>{
 for(const width of [180,400])for(const height of [100,200])for(const selected of [{x:0,y:0},{x:400,y:0},{x:0,y:200},{x:400,y:200},{x:90,y:50}]){const r=place({width,height,tipWidth:240,tipHeight:110,selected});assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width&&r.y+r.h<=height);assert.ok(Number.isFinite(r.score));}
});
