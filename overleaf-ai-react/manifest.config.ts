import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'PacificOceanAI',
  version: '2.0.3',
  description: 'PacificOceanAI - AI Assistant for Overleaf LaTeX Editor',
  permissions: ['storage'],
  host_permissions: [
    'https://www.overleaf.com/*',
    'https://latex.sysu.edu.cn/*'
  ],
  options_page: 'src/extension/options/index.html',
  action: {
    default_popup: 'src/extension/popup/index.html',
    default_title: 'PacificOceanAI',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png'
    }
  },
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png'
  },
  content_scripts: [
    {
      matches: [
        'https://www.overleaf.com/*',
        'https://latex.sysu.edu.cn/*'
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
        'images/*',
        'icons/*'
      ],
      matches: [
        'https://www.overleaf.com/*',
        'https://latex.sysu.edu.cn/*'
      ]
    }
  ]
});
