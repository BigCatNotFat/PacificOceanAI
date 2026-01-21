import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [16, 48, 128];
const svgPath = join(__dirname, '../public/icons/icon.svg');
const outputDir = join(__dirname, '../public/icons');

// 确保输出目录存在
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const svgBuffer = readFileSync(svgPath);

console.log('🎨 正在生成图标...\n');

for (const size of sizes) {
  const outputPath = join(outputDir, `icon${size}.png`);
  
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath);
  
  console.log(`✅ 已生成 icon${size}.png (${size}x${size})`);
}

console.log('\n🎉 所有图标生成完成！');
console.log(`📁 图标位置: ${outputDir}`);

