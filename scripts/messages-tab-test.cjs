const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function checkFeedAlignment(page,sourceCount){
 await page.waitForFunction(count=>{
  const toolbar=document.querySelector('.messages-toolbar').getBoundingClientRect();
  const preview=document.querySelector('#feed-preview');
  const rows=[...document.querySelectorAll('.feed-source')];
  return rows.length===count&&rows.every(row=>{
   const bounds=row.getBoundingClientRect(),remove=row.querySelector('.feed-remove');
   return Math.abs(bounds.left-toolbar.left)<1&&Math.abs(bounds.right-toolbar.right)<1
     &&Math.abs(remove.getBoundingClientRect().width-preview.getBoundingClientRect().width)<1
     &&getComputedStyle(remove).fontSize===getComputedStyle(preview).fontSize;
  });
 },sourceCount,{timeout:5000});
}
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-messages-tab-'));let app;try{
 const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});const p=await app.firstWindow(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.waitForFunction(()=>window.quota);await p.locator('#toggle').click();
 await p.locator('#tab-messages').click();assert.equal(await p.locator('#feed-form').isVisible(),false);assert.equal(await p.locator('#cards').isVisible(),false);assert.equal(await p.locator('#add-account-area').isVisible(),false);assert.equal(await p.locator('#settings #feed-url').count(),0);
 assert.equal(await p.locator('.feed-source strong').textContent(),'GitHub Blog');
 assert.equal((await p.evaluate(()=>quota.getState())).petMessages.sources[0].url,'https://github.blog/feed/');
 await p.locator('#feed-new').click();await p.locator('#feed-url').fill('http://example.com/feed');await p.locator('#feed-add').click();await p.locator('#feed-error').waitFor();
 await p.locator('#feed-url').fill('https://github.blog/feed/');await p.locator('#feed-url').press('Enter');await p.locator('#feed-form').waitFor({state:'hidden'});assert.equal((await p.evaluate(()=>quota.getState())).petMessages.sources.length,1);
 for(const url of ['https://www.nasa.gov/feed/','https://github.com/microsoft/vscode/releases.atom'])await p.evaluate(url=>quota.petFeedConfigure('add',url),url);
 await fs.mkdir('test-results/messages-tab',{recursive:true});
 for(const locale of ['zh-TW','en','ja','ko']){
  await p.evaluate(locale=>quota.settings({locale}),locale);await p.locator('#tab-messages').click();
  assert.equal(await p.locator('#tab-messages').getAttribute('aria-selected'),'true');assert.equal(await p.locator('.feed-source').count(),3);
  const overflow=await p.locator('.context-line,.view-tabs,.view-tabs button,#messages-panel,.messages-toolbar,.feed-source').evaluateAll(ns=>ns.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>({class:n.className,width:n.clientWidth,scroll:n.scrollWidth})));
  assert.deepEqual(overflow,[],locale+' layout fits');assert.equal(await p.locator('#feed-mute').evaluate(e=>getComputedStyle(e).appearance),'none');
  const buttons=p.locator('#feed-new,#feed-preview,.feed-remove');
  assert.ok((await buttons.evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height))).every(h=>h===30),locale+' consistent button heights');
  const actions=await p.locator('.messages-toolbar .messages-actions button').evaluateAll(ns=>ns.map(n=>{const box=n.getBoundingClientRect();return {id:n.id,y:box.y,width:box.width};}));
  assert.deepEqual(actions.map(a=>a.id),['feed-new','feed-preview']);
  assert.equal(actions[0].y,actions[1].y,locale+' actions share one row');
  assert.equal(actions[0].width,actions[1].width,locale+' actions have equal width');
  await checkFeedAlignment(p,3);
  const sourceSwitch=p.locator('.feed-toggle').first();assert.equal(await sourceSwitch.getAttribute('role'),'switch');assert.equal(await sourceSwitch.isChecked(),true);
  const switchStyles=await p.evaluate(()=>{const pick=n=>{const s=getComputedStyle(n);return[s.width,s.height,s.borderRadius,s.backgroundColor]};return{source:pick(document.querySelector('.feed-toggle')),settings:pick(document.querySelector('.settings input:checked'))}});
  assert.deepEqual(switchStyles.source,switchStyles.settings,locale+' source switch matches settings');
  await p.locator('.feed-remove').first().hover();assert.equal(await p.locator('.feed-remove').first().evaluate(n=>getComputedStyle(n).textDecorationLine),'none');
  await p.locator('#feed-heading').hover();
  await p.screenshot({path:'test-results/messages-tab/'+locale+'.png',animations:'disabled'});
  await p.locator('#tab-messages').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#tab-quota').getAttribute('aria-selected'),'true');await p.keyboard.press('End');assert.equal(await p.locator('#tab-messages').getAttribute('aria-selected'),'true');
 }
 await p.evaluate(()=>quota.petFeedConfigure('add','https://example.org/extra.xml'));
 await checkFeedAlignment(p,4);
 assert.ok(await p.locator('#feed-sources').evaluate(list=>list.scrollHeight>list.clientHeight),'long lists retain vertical scrolling');
 await p.locator('.feed-remove').last().click();
 await checkFeedAlignment(p,3);
 await p.locator('#feed-mute').check();await p.waitForFunction(async()=>(await quota.getState()).petMessages.muted);assert.equal(await p.locator('#feed-preview').isEnabled(),false);await p.locator('#feed-mute').uncheck();await p.waitForFunction(async()=>!(await quota.getState()).petMessages.muted);
 await p.locator('.feed-toggle').first().uncheck();await p.waitForFunction(async()=>!(await quota.getState()).petMessages.sources[0].enabled);assert.equal(await p.locator('.feed-toggle').first().isChecked(),false);
 await p.locator('.feed-toggle').first().check();await p.waitForFunction(async()=>(await quota.getState()).petMessages.sources[0].enabled);assert.equal(await p.locator('.feed-toggle').first().isChecked(),true);
 await p.locator('.feed-remove').first().click();await p.waitForFunction(async()=>(await quota.getState()).petMessages.sources.length===2);
 await p.locator('.feed-toggle').first().uncheck();await p.waitForFunction(async()=>!(await quota.getState()).petMessages.sources[0].enabled);
 await p.locator('#settings-toggle').click();assert.equal(await p.locator('#messages-panel').isVisible(),false);assert.equal(await p.locator('#settings #pet-feeds').count(),0);await p.locator('#tab-messages').click();assert.equal(await p.locator('#messages-panel').isVisible(),true);
 assert.deepEqual(errors,[]);await app.close();app=await _electron.launch({...(process.env.QUOTA_PACKAGED_EXE?{executablePath:process.env.QUOTA_PACKAGED_EXE}:{}),args:[...(process.env.QUOTA_PACKAGED_EXE?[]:['.']),'--demo','--test-mode'],env});const restored=await app.firstWindow();await restored.waitForFunction(()=>window.quota);assert.equal((await restored.evaluate(()=>quota.getState())).petMessages.sources.length,2,'sources survive tab relocation and restart');console.log('PASS messages tab: four locales, hidden add form, Enter, HTTPS validation, source controls, mute/preview, keyboard and settings separation; demo only');
 assert.equal((await restored.evaluate(()=>quota.getState())).petMessages.sources[0].enabled,false,'paused source persists after restart');
 assert.equal((await restored.evaluate(()=>quota.getState())).petMessages.sources.some(s=>s.url==='https://github.blog/feed/'),false,'removed default stays removed after restart');
 }finally{await app?.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'pebble-messages-tab-')));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1});
