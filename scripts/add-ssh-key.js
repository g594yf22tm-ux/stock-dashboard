const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const token = fs.readFileSync('/tmp/gh-token.txt', 'utf8').trim();
console.log('Token 已读取 (长度: ' + token.length + ')');

const pubkey = fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_ed25519.pub'), 'utf8').trim();
console.log('SSH 公钥已读取');

const data = JSON.stringify({
  title: 'stock-dashboard-' + new Date().toISOString().slice(0, 10),
  key: pubkey
});

const req = https.request({
  hostname: 'api.github.com',
  path: '/user/keys',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'stock-dashboard',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HTTP ' + res.statusCode + ': ' + body.substring(0, 200));
    if (res.statusCode === 201) console.log('\n✅ SSH 密钥已添加');
    else if (res.statusCode === 422) console.log('\n⚠ 密钥可能已存在');
  });
});
req.on('error', (e) => console.error('失败:', e.message));
req.write(data);
req.end();
