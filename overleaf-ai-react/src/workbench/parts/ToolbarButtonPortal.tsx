import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CLASSES, ELEMENTS, SELECTORS } from '../../base/common/constants';

type ToolbarButtonPortalProps = {
  onClick: () => void;
};

const ToolbarButtonPortal: React.FC<ToolbarButtonPortalProps> = ({ onClick }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let wrapper: HTMLElement | null = null;

    const inject = () => {
      const existing = document.getElementById(ELEMENTS.BUTTON_WRAPPER_ID);
      if (existing) {
        setHost(existing);
        return;
      }

      const containers = document.querySelectorAll(SELECTORS.TOOLBAR_BUTTON);
      if (containers.length > 0) {
        const targetContainer = containers[0] as HTMLElement;
        if (targetContainer && targetContainer.parentElement) {
          wrapper = document.createElement('div');
          wrapper.className = CLASSES.TOOLBAR_CONTAINER;
          wrapper.id = ELEMENTS.BUTTON_WRAPPER_ID;
          wrapper.style.marginRight = '8px';
          targetContainer.parentElement.insertBefore(wrapper, targetContainer);
          setHost(wrapper);
        }
      }
    };

    inject();
    const timeout = window.setTimeout(inject, 1000);

    const observer = new MutationObserver(() => inject());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <button
      type="button"
      className={CLASSES.BTN_PRIMARY}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
      onClick={onClick}
    >
      <span className="button-content" style={{ fontWeight: 600 }}>
        AI助手
      </span>
    </button>,
    host
  );
};

export default ToolbarButtonPortal;

