import { execSync } from 'child_process';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const viteDir = join(distDir, '.vite');

// 读取版本号
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf-8'));
const version = manifest.version;
const name = manifest.name.replace(/\s+/g, '');

console.log(`📦 正在打包 ${name} v${version}...\n`);

// 删除 .vite 目录（Chrome Web Store 不接受多个 manifest.json）
if (existsSync(viteDir)) {
  console.log('🗑️  删除 .vite 目录...');
  rmSync(viteDir, { recursive: true, force: true });
}

// 打包
const zipName = `${name}-v${version}.zip`;
const zipPath = join(rootDir, '..', zipName);

console.log(`📁 打包到: ${zipPath}`);

try {
  // Windows PowerShell
  execSync(`powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`, {
    stdio: 'inherit'
  });
  console.log(`\n✅ 打包完成: ${zipName}`);
} catch (error) {
  console.error('❌ 打包失败:', error.message);
  process.exit(1);
}

