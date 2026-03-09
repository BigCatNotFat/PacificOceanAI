/**
 * SVG 图标转 PNG 转换脚本
 * 
 * 使用方法：
 * 1. 安装依赖：npm install -D sharp
 * 2. 运行脚本：node scripts/convert-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { size: 16, name: 'icon16.png' },
  { size: 48, name: 'icon48.png' },
  { size: 128, name: 'icon128.png' }
];

const inputSvg = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

async function convertIcons() {
  console.log('🎨 开始转换图标...\n');

  // 检查 SVG 文件是否存在
  if (!fs.existsSync(inputSvg)) {
    console.error('❌ 错误: 找不到源文件 icon.svg');
    console.error(`   路径: ${inputSvg}`);
    process.exit(1);
  }

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 转换每个尺寸
  for (const { size, name } of sizes) {
    try {
      const outputPath = path.join(outputDir, name);
      
      await sharp(inputSvg)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ 已生成: ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`❌ 生成 ${name} 失败:`, error.message);
    }
  }

  console.log('\n🎉 图标转换完成！');
  console.log('\n📝 下一步：');
  console.log('1. 在 manifest.config.ts 中取消注释图标配置');
  console.log('2. 运行 npm run dev 或 npm run build');
  console.log('3. 重新加载浏览器插件\n');
}

convertIcons().catch(error => {
  console.error('❌ 转换失败:', error);
  process.exit(1);
});
