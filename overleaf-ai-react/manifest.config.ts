import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'My Overleaf AI',
  version: '1.0',
  description: '测试 Overleaf 插件开发',
  permissions: ['activeTab'],
  content_scripts: [
    {
      matches: ['https://www.overleaf.com/*'],
      js: ['src/extension/content/main.tsx']
    }
  ],
  web_accessible_resources: [
    {
      resources: ['src/workbench/styles/sidebar.css'],
      matches: ['https://www.overleaf.com/*']
    }
  ]
});
