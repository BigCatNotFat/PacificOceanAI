import React from 'react';
import ReactDOM from 'react-dom/client';
import OptionsApp from '../../workbench/parts/OptionsApp';

/**
 * Options 页面入口
 * 将 OptionsApp 组件挂载到 DOM
 */
const root = document.getElementById('options-root');

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <OptionsApp />
    </React.StrictMode>
  );
}
