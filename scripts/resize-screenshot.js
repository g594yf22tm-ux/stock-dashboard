/**
 * resize-screenshot.js
 * 自动将大分辨率截图压缩到适合 AI 识别的尺寸
 * 用法: node scripts/resize-screenshot.js [可选: 文件名]
 *       不带参数则处理 screenshots/ 下所有新截图
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const PROCESSED_DIR = path.join(SCREENSHOT_DIR, 'processed');
const MAX_WIDTH = 1000;

// 确保输出目录存在
if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

async function resizeImage(inputPath) {
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(PROCESSED_DIR, `${basename}_1000px.jpg`);

  // 跳过已处理的
  if (fs.existsSync(outputPath)) {
    console.log(`  ⏭️  跳过（已处理）: ${path.basename(inputPath)}`);
    return null;
  }

  try {
    const metadata = await sharp(inputPath).metadata();
    const origW = metadata.width;
    const origH = metadata.height;

    if (origW <= MAX_WIDTH) {
      // 原图够小，直接复制为 jpg
      await sharp(inputPath).jpeg({ quality: 85 }).toFile(outputPath);
      console.log(`  ✅ 已复制（无需缩放 ${origW}x${origH}）: ${path.basename(inputPath)}`);
    } else {
      await sharp(inputPath)
        .resize(MAX_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      const origSize = (fs.statSync(inputPath).size / 1024).toFixed(1);
      const newSize = (fs.statSync(outputPath).size / 1024).toFixed(1);
      console.log(`  ✅ 已压缩: ${origW}x${origH} → ${MAX_WIDTH}x${Math.round(origH * (MAX_WIDTH / origW))} | ${origSize}KB → ${newSize}KB | ${path.basename(inputPath)}`);
    }
    return outputPath;
  } catch (err) {
    console.error(`  ❌ 处理失败: ${path.basename(inputPath)} → ${err.message}`);
    return null;
  }
}

async function main() {
  const targetFile = process.argv[2];

  if (targetFile) {
    // 处理指定文件
    const inputPath = path.isAbsolute(targetFile)
      ? targetFile
      : path.join(SCREENSHOT_DIR, targetFile);

    if (!fs.existsSync(inputPath)) {
      console.error(`❌ 文件不存在: ${inputPath}`);
      process.exit(1);
    }
    const result = await resizeImage(inputPath);
    if (result) {
      console.log(`\n🎯 分析此截图:`);
      console.log(`   在 Claude Code 中输入: /analyze-screenshot`);
    }
  } else {
    // 批量处理
    console.log('🖼️  扫描 screenshots/ 目录...');

    const files = fs.readdirSync(SCREENSHOT_DIR)
      .filter(f => /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(f))
      .filter(f => !f.includes('processed'));

    if (files.length === 0) {
      console.log('   📭 没有需要处理的截图');
      console.log(`\n请先将截图保存到: ${SCREENSHOT_DIR}`);
      return;
    }

    console.log(`   找到 ${files.length} 张截图`);
    const results = [];
    for (const file of files) {
      const resultPath = await resizeImage(path.join(SCREENSHOT_DIR, file));
      if (resultPath) results.push(resultPath);
    }

    if (results.length > 0) {
      console.log(`\n✅ 全部处理完成！共 ${results.length} 张`);
      console.log('🎯 在 Claude Code 中运行: /analyze-screenshot');
      console.log(`\n处理后文件:`);
      results.forEach(r => console.log(`   ${r}`));
    }
  }
}

main().catch(err => {
  console.error('运行失败:', err.message);
  process.exit(1);
});
