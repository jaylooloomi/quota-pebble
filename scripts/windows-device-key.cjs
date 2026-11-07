// Experimental independent Windows signer. Not wired to the production app.
const {spawn} = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const KEY_ID = /^qp_osn_[a-f0-9-]{36}$/;
function operation(action, keyId, payload) {
  if (process.platform !== 'win32') return Promise.reject(Error('Windows only'));
  if (!KEY_ID.test(keyId)) return Promise.reject(Error('Invalid Pebble key identifier'));
  if (!['create','public','sign','delete'].includes(action)) return Promise.reject(Error('Unsupported action'));
  if (action === 'sign' && (!Buffer.isBuffer(payload) || !payload.length || payload.length > 16384)) return Promise.reject(Error('Invalid payload size'));
  return new Promise((resolve,reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const child = spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'windows-device-key.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',done=false; const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('CNG operation timed out'));},15000);
    child.stdout.on('data',b=>{output+=b;if(output.length>16384){child.kill();finish(Error('CNG output too large'));}});
    child.stderr.resume(); child.stdin.on('error',()=>{});
    child.on('error',()=>finish(Error('CNG helper could not start')));
    child.on('close',code=>{if(code!==0)return finish(Error('CNG operation failed'));try{finish(null,JSON.parse(output.replace(/^\uFEFF/,'')));}catch{finish(Error('Invalid CNG response'));}});
    child.stdin.end(JSON.stringify({action,keyId,...(payload?{payloadBase64:payload.toString('base64')}:{})}));
  });
}
function publicSpki(blobBase64) {
  const b=Buffer.from(blobBase64,'base64');
  if(b.length!==72 || b.readUInt32LE(0)!==0x31534345 || b.readUInt32LE(4)!==32) throw Error('Invalid CNG P-256 public blob');
  return crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:b.subarray(8,40).toString('base64url'),y:b.subarray(40).toString('base64url')},format:'jwk'}).export({type:'spki',format:'der'}).toString('base64');
}
function derSignature(raw) {
  if(raw.length!==64)throw Error('Invalid P-256 signature');
  const integer=b=>{while(b.length>1&&b[0]===0)b=b.subarray(1);if(b[0]&128)b=Buffer.concat([Buffer.from([0]),b]);return Buffer.concat([Buffer.from([2,b.length]),b]);};
  const body=Buffer.concat([integer(raw.subarray(0,32)),integer(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30,body.length]),body]);
}
module.exports={operation,publicSpki,derSignature};
