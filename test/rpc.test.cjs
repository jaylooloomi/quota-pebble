const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CodexRpc } = require('../dist/rpc');
test('Codex app-server handshake precedes quota queries and concurrent replies match their IDs', async () => {
  const rpc = new CodexRpc(() => ({ file: process.execPath, args: [path.join(__dirname, 'fixtures/rpc-server.cjs')] }));
  try {
    const [a, b] = await Promise.all([rpc.call('account/read'), rpc.call('account/rateLimits/read')]);
    assert.equal(a.account.type, 'chatgpt'); assert.equal(b.rateLimits.primary.usedPercent, 23);
    await assert.rejects(rpc.call('fail'), { code: 'network' });
  } finally { rpc.close(); }
});
test('missing Codex process rejects pending requests without crashing', async () => {
  const rpc = new CodexRpc(() => ({ file: 'nonexistent-quota-island-cli-123', args: [] }));
  await assert.rejects(rpc.call('account/read'), { code: 'missing_cli' }); rpc.close();
});
test('a proxy exiting before the handshake does not crash on a broken stdin pipe',async()=>{
  for(let i=0;i<8;i++){
    const rpc=new CodexRpc(()=>({file:process.execPath,args:['-e','process.exit(0)']}),'proxy');
    try{await assert.rejects(rpc.call('thread/list'));}finally{rpc.close();}
  }
});
test('official proxy performs WebSocket upgrade and exchanges RPC frames instead of JSONL',async()=>{
  const rpc=new CodexRpc(()=>({file:process.execPath,args:[path.join(__dirname,'fixtures/rpc-websocket.cjs')]}),'proxy');
  try{assert.deepEqual(await rpc.call('thread/loaded/list',{}),{data:['active-real-runtime']});assert.equal((await rpc.call('thread/list',{})).data[0].status.type,'active');}finally{rpc.close();}
});
