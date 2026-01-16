/**
 * overleafBridge.js 构建脚本
 * 
 * 功能：
 * 1. 读取 public/injected/overleafBridge.js 源文件
 * 2. 复制到 dist/injected/overleafBridge.js
 * 
 * 注意：模块化结构已经创建在 public/injected/modules/ 中
 * 当前构建策略是直接复制原始文件以保证功能不变
 * 未来可以扩展此脚本以支持真正的模块打包
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 路径配置
const SOURCE_FILE = path.join(__dirname, '../public/injected/overleafBridge.js');
const DIST_DIR = path.join(__dirname, '../dist/injected');
const DIST_FILE = path.join(DIST_DIR, 'overleafBridge.js');

console.log('🔨 开始构建 overleafBridge.js...');
console.log(`📂 源文件: ${SOURCE_FILE}`);
console.log(`📂 目标文件: ${DIST_FILE}`);

try {
  // 确保 dist/injected 目录存在
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
    console.log(`✅ 创建目录: ${DIST_DIR}`);
  }
  
  // 读取源文件
  const sourceContent = fs.readFileSync(SOURCE_FILE, 'utf8');
  console.log(`✅ 读取源文件: ${sourceContent.length} 字符`);
  
  // 添加构建标记注释
  const buildInfo = `/**
 * ⚠️ 此文件由构建脚本自动生成，请勿直接修改
 * 源文件位置: public/injected/overleafBridge.js
 * 模块化源码位置: public/injected/modules/
 * 
 * 构建时间: ${new Date().toISOString()}
 * 构建脚本: scripts/build-bridge.js
 */

`;
  
  const distContent = buildInfo + sourceContent;
  
  // 写入目标文件
  fs.writeFileSync(DIST_FILE, distContent, 'utf8');
  console.log(`✅ 写入目标文件: ${distContent.length} 字符`);
  
  console.log('✨ 构建完成！');
  console.log('');
  console.log('📝 模块化重构说明：');
  console.log('   - 核心模块: public/injected/modules/core/');
  console.log('   - 搜索模块: public/injected/modules/search/');
  console.log('   - 方法处理器: public/injected/modules/methodHandlers/');
  console.log('   - 选区工具提示: public/injected/modules/selectionTooltip/');
  console.log('   - 预览系统: public/injected/modules/preview/');
  console.log('   - Diff建议: public/injected/modules/diff/');
  console.log('   - 模型管理: public/injected/modules/modelManagement/');
  console.log('');
  console.log('💡 未来扩展：');
  console.log('   可以修改此脚本以支持从模块化源码构建单文件版本');
  
} catch (error) {
  console.error('❌ 构建失败:', error.message);
  process.exit(1);
}

