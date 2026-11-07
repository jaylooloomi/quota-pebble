// Passive local-session inspection: never starts CLI, inference, RPC or Hooks.
const {LocalTaskMonitor}=require('../dist/local-task-monitor'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
(async()=>{
  const root=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions'),monitor=new LocalTaskMonitor(root,()=>{});
  try{await monitor.start();const s=monitor.snapshot();const report={time:new Date().toISOString(),mode:'local-records',inferred:true,cliStarted:false,hooksUsed:false,connection:s.connection,partial:s.partial,counts:s.counts,rows:s.rows.map(({id,status,source,confirmedAt})=>({id,status,source,lastEvent:confirmedAt}))};
    fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/task-monitor-live.json',JSON.stringify(report,null,2));console.log(report);
  }finally{monitor.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
