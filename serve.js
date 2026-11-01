const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(__dirname,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'text/plain','Cache-Control':'no-store'});res.end(d); });
}).listen(8899,()=>console.log('http://127.0.0.1:8899'));
