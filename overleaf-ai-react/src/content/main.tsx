import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from './App';
import '../styles/sidebar.css';

const CONTAINER_ID = 'overleaf-ai-react-root';

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

mountApp();
console.log('✅ Overleaf AI 助手已加载');
