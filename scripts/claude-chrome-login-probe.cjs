const {app}=require('electron'),path=require('node:path'),fs=require('node:fs/promises');
const {ClaudeWebSession}=require('../dist/claude-web-session');
app.setName('Quota Pebble Chrome Login Validation');app.setPath('userData',path.join(app.getPath('appData'),'quota-pebble-chrome-validation'));app.on('window-all-closed',()=>{});
let client;
app.whenReady().then(async()=>{
 client=new ClaudeWebSession(path.join(app.getPath('userData'),'profile'));
 try{await client.prepare();console.log('Chrome opened; waiting for user sign-in.');await client.waitForChromeLogin();await client.login();const reading=await client.read();const report={passed:true,checkedAt:new Date().toISOString(),source:reading.source,windows:reading.windows};await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/claude-chrome-login-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
 catch(error){console.log(JSON.stringify({passed:false,code:error.code??'validation',message:error.code?error.message:'Chrome validation failed'}));}
 finally{client?.close();app.quit();}
});
