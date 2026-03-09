/**
 * overleafBridge.js 新构建脚本
 * 使用 esbuild 构建模块化版本
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 路径配置
const MODULES_DIR = path.join(__dirname, '../public/injected/modules');
const MAIN_FILE = path.join(MODULES_DIR, 'main.js');
const OUTPUT_DIR = path.join(__dirname, '../public/injected/generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'overleafBridge.js');

console.log('🔨 开始构建 overleafBridge.js (ESM Bundled)...');
console.log(`📂 入口文件: ${MAIN_FILE}`);
console.log(`📂 输出文件: ${OUTPUT_FILE}`);
console.log('');

try {
  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // 构建标记注释
  const banner = `/**
 * ⚠️  此文件由构建脚本自动生成，请勿直接修改
 * 
 * 源文件位置: public/injected/modules/
 * 入口文件: main.js
 * 
 * 构建时间: ${new Date().toISOString()}
 * 构建脚本: scripts/build-bridge-new.js
 * 构建工具: esbuild
 */
`;

  // 使用 esbuild 打包
  esbuild.buildSync({
    entryPoints: [MAIN_FILE],
    outfile: OUTPUT_FILE,
    bundle: true,
    format: 'iife', // 立即执行函数，避免污染全局作用域 (除了明确挂载到 window 的)
    target: ['es2020'],
    banner: { js: banner },
    platform: 'browser',
    sourcemap: false, // 注入脚本通常不需要 sourcemap，或者可以使用 'inline'
    minify: false,    // 开发阶段不压缩，方便调试
  });

  console.log('✨ 构建完成！');
  
  // 获取文件大小
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`📦 文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
  
} catch (error) {
  console.error('❌ 构建失败:', error.message);
  if (error.errors) {
    error.errors.forEach(e => console.error(e));
  }
  process.exit(1);
}
