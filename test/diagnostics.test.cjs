const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Diagnostics}=require('../dist/diagnostics');
test('task notification diagnostics prove decisions and shown events without retaining task or account content',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-task-log-'));try{
  const d=new Diagnostics(dir),tasks={liveCoverage:true,rows:[{provider:'claude',status:'idle',title:'SECRET',project:'SECRET',id:'SECRET'}]},tracker={tracked:1,armed:0,pending:0,decisions:{'claude:baseline_nonrunning':1,SECRET:99}},flags={enabled:true,paused:false,visible:true,SECRET:'SECRET'};
  d.taskMonitor(tasks,tracker,flags);d.taskMonitor(tasks,tracker,flags);d.taskNotice('idle','claude','queued');d.taskNotice('idle','claude','shown');d.taskNotice('SECRET','SECRET','SECRET');const raw=fs.readFileSync(d.file,'utf8'),rows=raw.trim().split('\n').map(JSON.parse);assert.equal(rows.length,3);assert.equal(rows[0].counts.claude.idle,1);assert.equal(rows[0].tracker.decisions['claude:baseline_nonrunning'],1);assert.equal(rows[2].stage,'shown');assert.ok(!raw.includes('SECRET'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('diagnostics records disabled sources and missing resets without credential or account data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-log-'));try{
    const logger=new Diagnostics(dir);logger.startup('1.2.4',{claude:true,codex:false,gemini:true});logger.sourceToggle('codex',true);
    const state={providers:{claude:{enabled:true,status:'ready',error:'Bearer SECRET email@example.com',updatedAt:'2026-10-31T00:00:00Z',reading:{token:'SECRET',label:'Private account',windows:[{id:'five_hour',usedPercent:0,resetsAt:null},{id:'seven_day',usedPercent:15,resetsAt:'2026-11-04T14:00:00Z'}]}}}};
    logger.observe(state);logger.observe(state);const text=fs.readFileSync(logger.file,'utf8'),rows=text.trim().split('\n').map(JSON.parse);
    assert.equal(rows.length,3);assert.equal(rows[0].enabled.codex,false);assert.equal(rows[1].origin,'settings');assert.equal(rows[2].windows[0].usedPercent,0);assert.equal(rows[2].windows[0].resetsAt,null);assert.equal(rows[2].windows[1].kind,'weekly');
    for(const privateValue of ['SECRET','email@example.com','Private account','Bearer'])assert.equal(text.includes(privateValue),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('diagnostics rotates bounded files and tolerates unwritable destinations',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-log-'));try{
    const logger=new Diagnostics(dir,1);logger.startup('1',{});logger.sourceToggle('codex',false);assert.ok(fs.existsSync(logger.file+'.1'));
    const blocked=path.join(dir,'file');fs.writeFileSync(blocked,'x');assert.doesNotThrow(()=>new Diagnostics(blocked).startup('1',{}));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('auth diagnostics record transitions and cancellation without authorization data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-auth-log-'));try{
    const d=new Diagnostics(dir),s={auth:{claude:{phase:'web_login',pending:true,message:'SECRET',browserUrl:'https://private.example/SECRET',code:'SECRET',canReopen:true}}};
    d.observe(s);d.observe(s);s.auth.claude.phase='verifying';d.observe(s);delete s.auth.claude;d.observe(s);
    const text=fs.readFileSync(d.file,'utf8'),rows=text.trim().split('\n').map(JSON.parse);assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.phase),['web_login','verifying','none']);assert.equal(rows[2].pending,false);assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('https://'));
  }finally{assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-auth-log-')));fs.rmSync(dir,{recursive:true,force:true});}
});
