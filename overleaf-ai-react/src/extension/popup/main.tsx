import '../../utils/silenceConsole';
import React from 'react';
import { createRoot } from 'react-dom/client';
import PopupApp from '../../workbench/parts/PopupApp';
import '../../workbench/styles/popup.css';

function mountPopup(): void {
  const container = document.getElementById('popup-root');
  if (!container) {
    return;
  }

  const root = createRoot(container);
  root.render(<PopupApp />);

  if ((import.meta as any).hot) {
    (import.meta as any).hot.dispose(() => root.unmount());
  }
}

mountPopup();
