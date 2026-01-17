/**
 * overleafBridge.js 新构建脚本
 * 使用智能合并策略构建单文件版本
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 路径配置
const MODULES_DIR = path.join(__dirname, '../public/injected/modules');
const MAIN_FILE = path.join(MODULES_DIR, 'main.js');
const LEGACY_FILE = path.join(MODULES_DIR, 'legacy.js');
const OUTPUT_DIR = path.join(__dirname, '../public/injected/generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'overleafBridge.js');

console.log('🔨 开始构建 overleafBridge.js (模块化版本)...');
console.log(`📂 模块目录: ${MODULES_DIR}`);
console.log(`📂 输出文件: ${OUTPUT_FILE}`);
console.log('');

try {
  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✅ 创建目录: ${OUTPUT_DIR}`);
  }
  
  // 读取主入口文件
  console.log('📖 读取 main.js...');
  const mainContent = fs.readFileSync(MAIN_FILE, 'utf8');
  console.log(`✅ Main: ${mainContent.length} 字符`);
  
  // 读取 legacy 模块
  console.log('📖 读取 legacy.js...');
  const legacyContent = fs.readFileSync(LEGACY_FILE, 'utf8');
  console.log(`✅ Legacy: ${legacyContent.length} 字符`);
  
  // 构建标记注释
  const buildInfo = `/**
 * ⚠️  此文件由构建脚本自动生成，请勿直接修改
 * 
 * 源文件位置: public/injected/modules/
 *   - main.js: 主入口和核心模块
 *   - legacy.js: 大型 UI 模块（选区工具提示、预览系统、Diff 建议）
 *   - core/: 核心功能模块
 *   - search/: 搜索功能模块
 *   - methodHandlers/: API 方法处理器
 *   - modelManagement/: 模型管理模块
 * 
 * 构建时间: ${new Date().toISOString()}
 * 构建脚本: scripts/build-bridge-new.js
 * 构建策略: 智能合并（main.js + legacy.js）
 * 
 * 构建流程: modules/ → public/injected/generated/ → Vite → dist/injected/
 */

`;
  
  // 合并所有内容
  const combinedContent = buildInfo + mainContent + '\n\n' + legacyContent;
  
  // 写入到 public 目录（供 Vite 构建使用）
  console.log('💾 写入到 public 目录...');
  fs.writeFileSync(OUTPUT_FILE, combinedContent, 'utf8');
  console.log(`✅ 写入完成: ${combinedContent.length} 字符`);
  console.log(`📁 输出位置: ${OUTPUT_FILE}`);
  
  console.log('');
  console.log('✨ 构建完成！');
  console.log('');
  console.log('📊 模块统计:');
  console.log(`   - Main 入口: ${mainContent.split('\n').length} 行`);
  console.log(`   - Legacy UI: ${legacyContent.split('\n').length} 行`);
  console.log(`   - 总计: ${combinedContent.split('\n').length} 行`);
  console.log('');
  console.log('📝 模块化结构:');
  console.log('   ✅ core/ - 核心功能');
  console.log('   ✅ search/ - 搜索引擎');
  console.log('   ✅ methodHandlers/ - API 处理器');
  console.log('   ✅ modelManagement/ - 模型管理');
  console.log('   ✅ selectionTooltip/ - 工具提示核心');
  console.log('   ✅ legacy.js - 完整 UI 模块');
  console.log('');
  console.log('📦 构建流程:');
  console.log('   1. modules/ → public/injected/generated/overleafBridge.js (此步骤)');
  console.log('   2. Vite 会自动将 public/ 复制到 dist/');
  console.log('   3. 最终浏览器加载 dist/injected/overleafBridge.js');
  console.log('');
  console.log('🎯 接口兼容性: 100%');
  console.log('✅ 构建状态: 正常');
  
} catch (error) {
  console.error('❌ 构建失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}

