const http=require('node:http'),{Duplex}=require('node:stream'),{WebSocketServer}=require('ws');
const wire=new Duplex({read(){},write(data,encoding,callback){process.stdout.write(data,encoding,callback);}});
wire.setTimeout=()=>wire;wire.setNoDelay=()=>wire;wire.setKeepAlive=()=>wire;
process.stdin.on('data',b=>wire.push(b));process.stdin.on('end',()=>wire.push(null));
const server=http.createServer(),wss=new WebSocketServer({noServer:true});
server.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,ws=>{
  let initialized=false;
  ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.method==='initialized'){initialized=true;return;}if(m.id===undefined)return;
    const result=m.method==='initialize'?{}:m.method==='thread/loaded/list'?{data:['active-real-runtime']}:m.method==='thread/list'?{data:[{id:'active-real-runtime',name:'Runtime fixture',cwd:'P',status:{type:'active',activeFlags:[]}}]}:{ok:initialized};
    ws.send(JSON.stringify({id:m.id,result}));
  });
}));server.emit('connection',wire);
