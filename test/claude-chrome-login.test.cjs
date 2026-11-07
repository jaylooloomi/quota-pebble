const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromeLoginArgs}=require('../dist/claude-chrome-login');
test('Chrome login uses an isolated profile and localhost debugging, without changing Chrome protections',()=>{
 const directory=path.join(os.tmpdir(),'pebble-fixture','chrome-login'),args=chromeLoginArgs(directory);
 assert.ok(args.includes('--user-data-dir='+path.resolve(directory)));assert.ok(!args.some(value=>value.startsWith('--remote-debugging')),'interactive sign-in uses ordinary Chrome without debugging');assert.equal(args.at(-1),'https://claude.ai/new');
 const background=chromeLoginArgs(directory,true);assert.ok(background.includes('--remote-debugging-address=127.0.0.1'));assert.ok(background.includes('--remote-debugging-port=0'));assert.equal(background.at(-1),'about:blank','background transfer does not navigate through a challenge');
 assert.ok(args.every(value=>!value.includes('no-sandbox')&&!value.includes('disable-web-security')&&!value.includes('enable-automation')));
 assert.throws(()=>chromeLoginArgs(os.homedir()));assert.throws(()=>chromeLoginArgs(path.join(os.tmpdir(),'Default')));
});
