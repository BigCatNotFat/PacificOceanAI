/**
 * 提取 overleafBridge.js 中的大型 UI 模块到 legacy.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_FILE = path.join(__dirname, '../public/injected/overleafBridge.js');
const LEGACY_FILE = path.join(__dirname, '../public/injected/modules/legacy.js');

console.log('📖 读取原始文件...');
const content = fs.readFileSync(SOURCE_FILE, 'utf8');
const lines = content.split('\n');

console.log(`✅ 文件包含 ${lines.length} 行`);

// 提取选区工具提示、预览系统、Diff系统的代码
// 从行 863 开始到文件末尾（这部分包含所有大型 UI 模块）
const legacyStartLine = 863; // "// ============ 选区提示框功能"之前
const legacyLines = lines.slice(legacyStartLine);

const legacyContent = `/**
 * Legacy UI Modules
 * 包含选区工具提示、预览系统、Diff 建议系统的完整代码
 * 
 * 注意：这些模块包含大量 UI 和交互逻辑，暂时保留在此文件中
 * 未来可以进一步拆分为更小的模块
 */

${legacyLines.join('\n')}
`;

console.log('💾 写入 legacy.js...');
fs.writeFileSync(LEGACY_FILE, legacyContent, 'utf8');

console.log(`✅ Legacy 模块已创建: ${legacyLines.length} 行`);
console.log(`📁 文件位置: ${LEGACY_FILE}`);

