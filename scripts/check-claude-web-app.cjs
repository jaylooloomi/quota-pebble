// Explicit live verification of the installed source, not a fixture.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
if(!process.argv.includes('--live')||!process.env.QUOTA_PACKAGED_EXE)throw Error('Explicit --live and QUOTA_PACKAGED_EXE required');
(async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({executablePath:process.env.QUOTA_PACKAGED_EXE,args:[],env,timeout:60000});try{
 const page=await app.firstWindow();await page.waitForFunction(()=>window.quota,{timeout:30000});
 const paths=await app.evaluate(({app})=>({data:app.getPath('userData')}));const path=require('node:path');
 const logs=await fs.readFile(path.join(paths.data,'logs/diagnostics.jsonl'),'utf8').catch(()=>'');console.log(JSON.stringify({migration:logs.trim().split('\n').slice(-100).flatMap(line=>{try{const e=JSON.parse(line);return e.event==='claude_web_migration'?[{stage:e.stage}]:[];}catch{return[];}}).slice(-1)}));
 for(let i=0;i<180;i++){const ready=await page.evaluate(async()=>{const state=await window.quota.getState();return state.providers.claude.status==='ready';});if(ready)break;await new Promise(resolve=>setTimeout(resolve,250));}
 const report=await page.evaluate(async()=>{const state=await quota.getState(),s=state.providers.claude;return{version:state.version,source:state.claudeQuotaSource,status:s.status,updatedAt:s.updatedAt,errorCode:s.errorCode??null,error:s.error,plan:s.reading?.plan??null,windows:s.reading?.windows??[],description:s.reading?.source??null};});
 await fs.writeFile('test-results/claude-web-packaged-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.equal(report.source,'web');assert.equal(report.status,'ready');assert.ok(report.windows.some(w=>w.id==='seven_day'));
 await page.locator('#toggle').click();await page.locator('#tab-quota').click();await page.screenshot({path:'test-results/claude-web-packaged-live.png'});
 }finally{await app.close();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
