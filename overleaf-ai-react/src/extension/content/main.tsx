import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from '../../workbench/parts/App';
import '../../workbench/styles/sidebar.css';
import { overleafEditor } from '../../services/editor/OverleafEditor';

const CONTAINER_ID = 'overleaf-ai-react-root';

// 注入桥接脚本到页面主世界
function injectBridgeScript(): void {
  overleafEditor.injectScript();
}

function mountApp(): void {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
  }

  const root: Root = createRoot(container);
  root.render(<App />);

  if ((import.meta as any).hot) {
    (import.meta as any).hot.dispose(() => root.unmount());
  }
}

// 先注入桥接脚本，再挂载应用
injectBridgeScript();
mountApp();
console.log('✅ Overleaf AI 助手已加载');

