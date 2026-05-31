/**
 * tunnel.js — 创建外网隧道，让其他电脑/手机通过公网URL访问仪表盘
 * 用法: node scripts/tunnel.js
 * 无需注册、无需配置路由器，免费使用
 */
const localtunnel = require('localtunnel');
const PORT = process.env.PORT || 3000;

(async () => {
  console.log('🌐 正在创建外网隧道...');
  console.log('');

  try {
    const tunnel = await localtunnel({
      port: PORT,
      subdomain: undefined // 随机子域名
    });

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║           🌐 外网访问已开通                           ║');
    console.log('║                                                      ║');
    console.log(`║  🔗 公网地址: ${tunnel.url}              ║`);
    console.log('║                                                      ║');
    console.log('║  📱 手机/其他电脑打开此链接即可访问                  ║');
    console.log('║  ⚠️  此链接每次启动会变化                            ║');
    console.log('║  ⚠️  关闭此窗口后外网访问即中断                      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    tunnel.on('close', () => {
      console.log('');
      console.log('🔴 外网隧道已关闭');
    });

    tunnel.on('error', (err) => {
      console.error('❌ 隧道错误:', err.message);
    });

    // 保持运行
    console.log('按 Ctrl+C 关闭隧道\n');
  } catch (err) {
    console.error('❌ 创建隧道失败:', err.message);
    console.log('');
    console.log('可能的原因:');
    console.log('  1. 网络连接问题 — 检查是否能访问外网');
    console.log('  2. localtunnel 服务暂时不可用 — 稍后重试');
    console.log('');
    console.log('备选方案 (更稳定，需注册免费账号):');
    console.log('  1. 下载 ngrok: https://ngrok.com/download');
    console.log('  2. 运行: ngrok http 3000');
    process.exit(1);
  }
})();
