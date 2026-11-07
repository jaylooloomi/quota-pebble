const { _electron:electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'quota-auth-e2e-'));
  const env = {...process.env,QUOTA_TEST_DATA:dir,CLAUDE_CONFIG_DIR:path.join(dir,'claude')}; delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({args:['scripts/auth-e2e-main.cjs','--test-mode'],env,timeout:30000});
  try {
    const page = await application.firstWindow();
    await page.evaluate(()=>window.quota.settings({googleSource:'code_assist'}));
    await page.locator('#toggle').click();
    await page.locator('.card.claude .empty-title').filter({hasText:'連接你的帳號'}).waitFor();
    // No misleading official-page link before an account has been connected.
    assert.equal(await page.locator('.card.claude .provider-link').isVisible(),false);
    await page.locator('.card.claude .connect-primary').click();
    await page.locator('.card.claude .continue-claude-login').waitFor({state:'visible'});
    await page.locator('.card.claude .close-connection').click();await page.locator('#tab-accounts').click();
    assert.equal(await page.locator('.card.claude .account-switch').isEnabled(),true,'pending web login must remain reachable');
    assert.notEqual(await page.locator('.card.claude .account-switch').evaluate(e=>getComputedStyle(e).cursor),'wait','waiting for a person is not a busy cursor');
    for(const locale of ['zh-TW','en','ja','ko']){await page.evaluate(locale=>quota.settings({locale}),locale);assert.equal(await page.locator('.card.claude .account-switch').isEnabled(),true);assert.equal(await page.locator('.card.claude .account-actions').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,locale+' pending actions fit');}
    await page.evaluate(()=>quota.settings({locale:'zh-TW'}));
    await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/pending-login-account.png'});
    const openedBefore=await application.evaluate(()=>globalThis.__AUTH_TEST_URLS.length);
    await page.locator('.card.claude .account-switch').click();
    await page.locator('.card.claude .continue-claude-login').waitFor({state:'visible'});
    assert.equal(await application.evaluate(()=>globalThis.__AUTH_TEST_URLS.length),openedBefore,'reopen progress without another browser tab');
    await page.locator('#tab-quota').click();await page.locator('.card.claude .connect-primary').click();
    await page.locator('.card.claude .continue-claude-login').click();
    await page.locator('.card.claude .auth-code-form').waitFor({state:'visible'});
    await page.locator('.card.claude .cancel-login').click();
    await page.waitForFunction(()=>!document.querySelector('.card.claude .login').disabled);
    await page.locator('.card.claude .auth-code-form').waitFor({state:'hidden'});
    assert.equal((await page.evaluate(()=>window.quota.getState())).auth.claude.phase,'error');
    await page.locator('.card.claude .login').click();
    await page.locator('.card.claude .continue-claude-login').click();
    await page.locator('.card.claude .auth-code-form').waitFor({state:'visible'});
    await page.locator('.card.claude .auth-code').fill('TEST-AUTH-CODE');
    await page.locator('.card.claude .auth-code-form button').click();
    await page.locator('.card.claude .quota-number').filter({hasText:'58'}).waitFor();
    assert.match(await page.locator('.card.claude .auth-message').textContent(),/已自動同步/);
    assert.equal(await page.locator('.card.claude .auth-code').inputValue(),'');
    await page.locator('.card.gemini .connect-primary').click();
    let url;
    for(let i=0;i<100;i++) { const urls = await application.evaluate(() => globalThis.__AUTH_TEST_URLS); url=urls.find(value => new URL(value).hostname==='accounts.google.com'); if(url)break; await new Promise(r=>setTimeout(r,50)); }
    assert.ok(url,'Google login URL emitted');
    const auth=new URL(url), callback=new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('code','TEST-GOOGLE-CODE'); callback.searchParams.set('state','WRONG');
    assert.equal((await fetch(callback)).status,400);
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
    callback.searchParams.set('state',auth.searchParams.get('state'));
    const response=await fetch(callback); assert.equal(response.status,200); await response.text();
    // No refresh click: completion must update the renderer and bring app back.
    await page.locator('.card.gemini .quota-number').filter({hasText:'60'}).waitFor();
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
    assert.match(await page.locator('.card.gemini .auth-message').textContent(),/已自動同步/);
    const state=await page.evaluate(()=>window.quota.getState());
    assert.equal(state.providers.gemini.status,'ready'); assert.equal(state.auth.gemini.phase,'ready');
    const bytes=await fs.readFile(path.join(dir,'gemini-session.bin'));
    assert.ok(!bytes.includes(Buffer.from('TEST-GOOGLE-NOT-REAL')));
    const beforeSwitch=await page.evaluate(()=>window.quota.getState());
    await page.locator('.card.codex .connection-status').click();
    assert.match(await page.locator('.card.codex .connection-description').textContent(),/不同帳號/);
    assert.match(await page.locator('.card.codex .connection-note').textContent(),/本機 Codex CLI/);
    await page.locator('.card.codex .login').filter({hasText:'切換 Codex 帳號'}).click();
    for(let i=0;i<100;i++){
      const opened=await application.evaluate(()=>globalThis.__AUTH_TEST_URLS.some(url=>new URL(url).hostname==='auth.openai.com'));
      if(opened)break;
      if(i===99)throw Error('Codex did not open its own OpenAI login');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    await application.evaluate(()=>globalThis.__AUTH_TEST_CODEX_COMPLETE());
    await page.locator('.card.codex .quota-number').filter({hasText:'35%'}).waitFor();
    const afterSwitch=await page.evaluate(()=>window.quota.getState());
    assert.equal(afterSwitch.auth.codex.phase,'ready');
    for(const id of ['claude','gemini']){
      assert.deepEqual(afterSwitch.providers[id],beforeSwitch.providers[id]);
      assert.deepEqual(afterSwitch.auth[id],beforeSwitch.auth[id]);
    }
    await page.locator('#tab-accounts').click();
    await page.locator('.card.codex .account-logout').click();
    assert.equal(await page.locator('.card.codex .logout-confirm').isVisible(),true);
    await page.locator('.card.codex .cancel-logout').click();
    assert.equal((await page.evaluate(()=>window.quota.getState())).providers.codex.status,'ready');
    await page.locator('.card.codex .account-logout').click();
    await page.locator('.card.codex .confirm-logout').click();
    await page.waitForFunction(async()=> (await window.quota.getState()).providers.codex.status==='signed_out');
    assert.equal((await page.evaluate(()=>window.quota.getState())).providers.codex.reading,null);
    await page.locator('.card.claude .account-logout').click();
    await page.locator('.card.claude .confirm-logout').click();
    await page.waitForFunction(async()=> (await window.quota.getState()).providers.claude.status==='signed_out');
    const loggedOut=await page.evaluate(()=>window.quota.getState());
    assert.deepEqual(loggedOut.providers.gemini,afterSwitch.providers.gemini);
    assert.equal(await page.locator('.card.gemini .account-logout').isVisible(),false);
    const report={passed:true,checks:['Pending web login remains reachable after closing details and switching tabs','Progress reentry does not open duplicate authorization tabs','Four-language pending account actions fit and never show a busy cursor','Codex opens its own OpenAI login and switches quota automatically','Codex account switch preserves Claude and Gemini state','Claude manual authorization code returns through CLI stdin','Google real loopback callback and encrypted vault','wrong OAuth state rejected','auth completion bypasses stale auth backoff','quota cards update without refresh click','app restores and expands after browser authorization','no misleading external sign-in link','authorization code input cleared']};
    await fs.mkdir('test-results',{recursive:true}); await fs.writeFile('test-results/auth-desktop.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
  } finally {await application.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
