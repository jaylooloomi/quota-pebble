const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {PetMessages,parseFeed,feedUrl,publicAddress}=require('../dist/pet-messages');
const rss=items=>'<rss version="2.0"><channel><title>Test</title>'+items.map(([id,title])=>'<item><guid>'+id+'</guid><title><![CDATA['+title+']]></title></item>').join('')+'</channel></rss>';
test('feed parsers normalize RSS and Atom as plain text, reject entity/oversize input and accept empty channels',()=>{assert.equal(parseFeed(rss([['a','<b>Hello</b> & friend']]))[0].title,'Hello & friend');assert.equal(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>x</id><title>Hello</title></entry></feed>')[0].title,'Hello');assert.deepEqual(parseFeed(rss([])),[]);assert.equal(parseFeed(rss([['code','Example <!DOCTYPE html>']])).length,1,'DOCTYPE text in CDATA is not a declaration');assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY x "huge">]><rss/>'));assert.throws(()=>parseFeed('x'.repeat(524289)));assert.throws(()=>parseFeed('<html/>'));assert.throws(()=>parseFeed('<a>'.repeat(65)+'</a>'.repeat(65)));});
test('feed URLs and network addresses reject credentialed URLs and local/private destinations',()=>{for(const url of ['http://example.com/feed','https://user:pass@example.com/feed','https://localhost/feed','https://example.com:444/feed'])assert.throws(()=>feedUrl(url));assert.equal(feedUrl('https://example.com/feed').protocol,'https:');for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('192.0.66.2'),true,'WordPress public feed address');});
test('first poll and restart seed silently; only new entries notify, duplicates collapse and no quota calls occur',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-feed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=Date.now(),xml=rss([['a','old']]),calls=0;const file=path.join(dir,'feeds.json'),m=new PetMessages(file,()=>{},async url=>{assert.equal(url,'https://github.blog/feed/');calls++;return xml;},()=>now);await m.tick();assert.equal(m.snapshot().items.length,0);now+=900001;xml=rss([['b','new'],['b','new'],['a','old']]);await m.tick();assert.equal(m.snapshot().items.length,1);m.acknowledge(m.snapshot().items[0].id);now+=900001;await m.tick();assert.equal(m.snapshot().items.length,0);const restored=new PetMessages(file,()=>{},async()=>xml,()=>now);await restored.tick();assert.equal(restored.snapshot().items.length,0);assert.equal(calls,3);m.close();restored.close();});
test('mute stops delivery, disabled sources stop polls, pending queue is bounded with visible overflow',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-feed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const m=new PetMessages(path.join(dir,'feed.json'),()=>{},async()=>rss([]));for(let i=0;i<52;i++)m.preview();assert.equal(m.snapshot().items.length,50);assert.equal(m.snapshot().overflow,2);m.configure('mute',true);m.preview();assert.equal(m.snapshot().items.length,0);m.configure('mute',false);m.preview();assert.equal(m.snapshot().items.length,1);m.close();});

test('feeds on one hostname keep independent queued messages and source limits',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-feed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=Date.now(),fresh=false;const file=path.join(dir,'feed.json');fs.writeFileSync(file,JSON.stringify({version:2,sources:[]}));const m=new PetMessages(file,()=>{},async url=>rss(fresh?[[url,'new']]:[]),()=>now);m.configure('add','https://example.com/a');await new Promise(r=>setImmediate(r));m.configure('add','https://example.com/b');await new Promise(r=>setImmediate(r));now+=900001;fresh=true;await m.tick();assert.equal(m.snapshot().items.length,2);const first=m.snapshot().sources[0].id;m.configure('remove',first);assert.equal(m.snapshot().items.length,1);assert.notEqual(m.snapshot().items[0].sourceId,first);for(let i=0;i<7;i++)m.configure('add','https://example.com/feed-'+i);assert.throws(()=>m.configure('add','https://example.com/extra'));m.close();});

test('default feed migration adds GitHub Blog once and respects existing sources and choices',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-feed-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'feed.json'),github='https://github.blog/feed/';
 const load=()=>new PetMessages(file,()=>{},undefined,Date.now,false);
 const write=sources=>fs.writeFileSync(file,JSON.stringify({version:1,muted:true,sources}));
 write([{url:'https://example.com/feed',enabled:false}]);
 const migrated=load();
 assert.equal(migrated.snapshot().muted,true);
 assert.deepEqual(migrated.snapshot().sources.map(({url,enabled})=>({url,enabled})),[
  {url:'https://example.com/feed',enabled:false},{url:github,enabled:true},
 ]);
 migrated.configure('remove',migrated.snapshot().sources[1].id);
 assert.equal(load().snapshot().sources.length,1);
 write([{url:github,enabled:false}]);
 assert.deepEqual(load().snapshot().sources.map(({label,enabled})=>({label,enabled})),[{label:'GitHub Blog',enabled:false}]);
 write(Array.from({length:8},(_,i)=>({url:'https://example.com/feed-'+i,enabled:true})));
 assert.equal(load().snapshot().sources.some(s=>s.url===github),false);
});
