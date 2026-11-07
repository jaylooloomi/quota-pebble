const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pebble-limit-ui-'));let app;try{
  const env={...process.env,QUOTA_TEST_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({args:['.','--demo','--test-mode'],env});const page=await app.firstWindow();await page.waitForFunction(()=>window.quota);await page.locator('#toggle').click();
  await app.evaluate(({shell})=>{global.__quotaUsageOpened=[];shell.openExternal=async url=>{global.__quotaUsageOpened.push(url);};});
  for(const locale of ['zh-TW','en','ja','ko']){
    await page.evaluate(async locale=>{const next=await quota.getState();next.settings.locale=locale;delete next.auth.claude;Object.assign(next.providers.claude,{status:'unavailable',reading:null,errorCode:'rate_limit',error:'服務暫時限制查詢頻率，等待後將自動重試',nextPollAt:Date.now()+3600000});render(next);},locale);
    const button=page.locator('.card.claude .connect-primary');assert.equal(await button.isVisible(),true);assert.ok(!/登入|Sign in|ログイン|로그인/.test(await button.textContent()));await button.click();
    assert.notEqual((await page.evaluate(()=>quota.getState())).auth.claude?.phase,'web_login');
    await page.locator('.card.claude .connection-status').click();await page.locator('.card.claude .login').click();await page.locator('.card.claude .close-connection').click();
  }
  const urls=await app.evaluate(()=>global.__quotaUsageOpened);assert.equal(urls.length,8);assert.ok(urls.every(url=>url==='https://claude.ai/settings/usage'));
  console.log('PASS four-language rate-limit action opens official usage without starting login; fixture only');
}finally{await app?.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1;});
