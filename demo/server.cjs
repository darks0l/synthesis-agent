const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const BASE = 'C:/Users/favcr/.openclaw/workspace/synthesis-agent/demo';

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const fname = parsed.pathname === '/' ? 'slide-template.html' : parsed.pathname.slice(1);
  const p = path.join(BASE, fname);

  fs.readFile(p, (e, d) => {
    if (e) {
      res.writeHead(404);
      res.end('not found: ' + p);
    } else {
      let html = d.toString();
      if (parsed.query.slide) {
        // Inject slide number directly
        html = html.replace(
          "const slideNum = parseInt(params.get('slide') || '1');",
          "const slideNum = " + parsed.query.slide + ";"
        );
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    }
  });
});

server.listen(18899, () => console.log('Server on 18899'));
