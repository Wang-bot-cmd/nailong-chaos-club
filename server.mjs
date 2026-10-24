import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.json':'application/json; charset=utf-8','.png':'image/png'};
const server = http.createServer((req, res) => {
  let filename;
  try { filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (filename === root) filename = path.join(root, 'index.html');
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(filename)] ?? 'application/octet-stream','Content-Length':stat.size});
    fs.createReadStream(filename).pipe(res);
  });
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`奶龙发疯事务所已开门：${url}\n游戏期间请保留这个窗口，关闭窗口即可结束。`);
  if (process.platform === 'win32') spawn('explorer.exe', [url], { windowsHide: true, detached: true, stdio:'ignore' }).unref();
});
