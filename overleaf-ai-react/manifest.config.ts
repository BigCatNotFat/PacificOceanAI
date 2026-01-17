import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'PacificOceanAI',
  version: '2.0',
  description: 'PacificOceanAI Plugin',
  permissions: ['storage'],
  host_permissions: [
    'https://www.overleaf.com/*',
    'https://latex.sysu.edu.cn/*',
    'http://192.168.124.22:3000/*'
  ],
  options_page: 'src/extension/options/index.html',
  action: {
    default_popup: 'src/extension/popup/index.html',
    default_title: 'PacificOceanAI'
    // 图标配置（可选）：将图标文件放在 public/icons/ 目录下后取消注释
    // default_icon: {
    //   '16': 'icons/icon16.png',
    //   '48': 'icons/icon48.png',
    //   '128': 'icons/icon128.png'
    // }
  },
  // 图标配置（可选）：将图标文件放在 public/icons/ 目录下后取消注释
  // icons: {
  //   '16': 'icons/icon16.png',
  //   '48': 'icons/icon48.png',
  //   '128': 'icons/icon128.png'
  // },
  content_scripts: [
    {
      matches: [
        'https://www.overleaf.com/*',
        'https://latex.sysu.edu.cn/*',
        'http://192.168.124.22:3000/*'
      ],
      js: ['src/extension/content/main.tsx'],
      run_at: 'document_idle'
    }
  ],
  web_accessible_resources: [
    {
      resources: [
        'src/workbench/styles/sidebar.css',
        'injected/generated/overleafBridge.js',
        'src/extension/options/index.html',
        'images/*'
      ],
      matches: [
        'https://www.overleaf.com/*',
        'https://latex.sysu.edu.cn/*',
        'http://192.168.124.22:3000/*'
      ]
    }
  ]
});
