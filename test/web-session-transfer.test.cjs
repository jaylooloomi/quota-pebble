const {test}=require('node:test'),assert=require('node:assert/strict');
const {sessionTransfer}=require('../dist/web-session-transfer');
test('Windows current-user encrypted transfer round-trips without plaintext storage',{skip:process.platform!=='win32'},async()=>{const bytes=Buffer.from('fixture-session-transfer-only');const protectedBytes=await sessionTransfer('protect',bytes);assert.ok(!protectedBytes.includes(bytes));assert.deepEqual(await sessionTransfer('unprotect',protectedBytes),bytes);await assert.rejects(sessionTransfer('unprotect',Buffer.from('invalid-fixture')));});
