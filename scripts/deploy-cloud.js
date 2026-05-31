/**
 * deploy-cloud.js
 * 一键部署到云服务器，关机也能跑
 * 用法: node scripts/deploy-cloud.js
 */

console.log('🌐 股票仪表盘 — 24小时不停机方案');
console.log('');
console.log('═══ 方案一：免费云部署（推荐） ═══');
console.log('');
console.log('Render.com — 免费，自动休眠但访问即醒');
console.log('');
console.log('步骤:');
console.log('  1. 打开 https://render.com 注册(GitHub登录)');
console.log('  2. 点 New → Web Service');
console.log('  3. 连接你的 GitHub 仓库');
console.log('  4. 设置:');
console.log('     Build Command:  npm install');
console.log('     Start Command:  node dashboard/server.js');
console.log('  5. 点 Deploy — 2分钟后获得永久地址');
console.log('');
console.log('  🟢 优点: 免费、无需信用卡、自动HTTPS');
console.log('  🟡 缺点: 15分钟无访问会休眠(打开即醒)');
console.log('');
console.log('');
console.log('═══ 方案二：国内云服务器（最稳定） ═══');
console.log('');
console.log('阿里云/腾讯云轻量应用服务器 — ¥68/月起');
console.log('');
console.log('步骤:');
console.log('  1. 购买轻量服务器(2核2G, 选CentOS)');
console.log('  2. 安装Node.js:');
console.log('     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -');
console.log('     sudo apt-get install -y nodejs');
console.log('  3. 上传项目: scp -r ./ 服务器IP:/home/stock-dashboard/');
console.log('  4. SSH进去: ssh root@服务器IP');
console.log('  5. cd /home/stock-dashboard && npm install');
console.log('  6. npm install -g pm2');
console.log('  7. pm2 start dashboard/server.js --name stock');
console.log('  8. pm2 save && pm2 startup');
console.log('');
console.log('  🟢 优点: 24小时真在线、国内访问快、Sina API无延迟');
console.log('  🟡 缺点: 月付¥68+');
console.log('');
console.log('');
console.log('═══ 方案三：UptimeRobot 保活（配合免费Render） ═══');
console.log('');
console.log('  Render免费版15分钟休眠 → UptimeRobot每5分钟访问一次 → 永不休眠');
console.log('');
console.log('  1. 按方案一部署Render');
console.log('  2. 打开 https://uptimerobot.com 注册');
console.log('  3. 添加监控 → HTTP(s) → 填入Render地址');
console.log('  4. 监控间隔5分钟');
console.log('');
console.log('  🟢 优点: 完全免费 + 永不休眠');
console.log('  🟡 缺点: 需要注册两个服务');
console.log('');
console.log('👉 推荐: 方案一 + 方案三 = 完全免费 + 24小时在线');
