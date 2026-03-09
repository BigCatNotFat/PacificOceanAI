import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CLASSES, ELEMENTS, SELECTORS, detectSiteType, SiteType } from '../../base/common/constants';

type ToolbarButtonPortalProps = {
  onClick: () => void;
};

/**
 * 根据网站类型查找合适的工具栏插入点
 */
function findToolbarInsertPoint(siteType: SiteType): { 
  element: HTMLElement | null; 
  position: 'before' | 'after';
  buttonStyle: 'official' | 'custom';
} {
  if (siteType === 'official') {
    // 官方 Overleaf: 使用原有逻辑
    const containers = document.querySelectorAll(SELECTORS.TOOLBAR_BUTTON);
    if (containers.length > 0) {
      return { 
        element: containers[0] as HTMLElement, 
        position: 'before',
        buttonStyle: 'official'
      };
    }
  } else {
    // 自建/高校版 Overleaf: 在 Share 按钮旁边插入
    // 首先尝试找到 Share 按钮（包含 group_add 图标或 "Share" 文本）
    const allButtons = document.querySelectorAll('button.btn.btn-full-height');
    for (const btn of allButtons) {
      const icon = btn.querySelector('.material-symbols');
      const label = btn.querySelector('.toolbar-label');
      if (
        (icon && icon.textContent?.trim() === 'group_add') ||
        (label && label.textContent?.trim() === 'Share')
      ) {
        return { 
          element: btn as HTMLElement, 
          position: 'after',
          buttonStyle: 'custom'
        };
      }
    }
    
    // 备用：尝试找到工具栏右侧区域
    const toolbarRight = document.querySelector(SELECTORS.TOOLBAR_GROUP);
    if (toolbarRight && toolbarRight.lastElementChild) {
      return { 
        element: toolbarRight.lastElementChild as HTMLElement, 
        position: 'after',
        buttonStyle: 'custom'
      };
    }
    
    // 再备用：找工具栏头部
    const toolbarHeader = document.querySelector(SELECTORS.TOOLBAR_HEADER);
    if (toolbarHeader) {
      const rightSection = toolbarHeader.querySelector('.toolbar-right');
      if (rightSection && rightSection.firstElementChild) {
        return { 
          element: rightSection.firstElementChild as HTMLElement, 
          position: 'before',
          buttonStyle: 'custom'
        };
      }
    }
  }
  
  return { element: null, position: 'before', buttonStyle: 'official' };
}

const ToolbarButtonPortal: React.FC<ToolbarButtonPortalProps> = ({ onClick }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [buttonStyle, setButtonStyle] = useState<'official' | 'custom'>('official');

  useEffect(() => {
    const siteType = detectSiteType();
    console.log('[ToolbarButtonPortal] 检测到网站类型:', siteType);

    const inject = () => {
      const existing = document.getElementById(ELEMENTS.BUTTON_WRAPPER_ID);
      if (existing) {
        setHost(existing);
        return;
      }

      const { element, position, buttonStyle: style } = findToolbarInsertPoint(siteType);
      
      if (element && element.parentElement) {
        const wrapper = document.createElement('div');
        wrapper.id = ELEMENTS.BUTTON_WRAPPER_ID;
        
        if (style === 'official') {
          wrapper.className = CLASSES.TOOLBAR_CONTAINER;
          wrapper.style.marginRight = '8px';
        } else {
          // 自建/高校版: 使用更适合的样式
          wrapper.style.display = 'inline-block';
          wrapper.style.marginLeft = '4px';
        }
        
        if (position === 'before') {
          element.parentElement.insertBefore(wrapper, element);
        } else {
          // 在目标元素后面插入
          if (element.nextSibling) {
            element.parentElement.insertBefore(wrapper, element.nextSibling);
          } else {
            element.parentElement.appendChild(wrapper);
          }
        }
        
        setHost(wrapper);
        setButtonStyle(style);
        console.log('[ToolbarButtonPortal] 按钮已注入，样式:', style);
      }
    };

    inject();
    const timeout = window.setTimeout(inject, 1000);
    const timeout2 = window.setTimeout(inject, 2000); // 额外延迟尝试

    const observer = new MutationObserver(() => inject());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(timeout2);
      observer.disconnect();
    };
  }, []);

  if (!host) return null;

  // 根据按钮样式类型渲染不同的按钮
  if (buttonStyle === 'custom') {
    // 自建/高校版 Overleaf 的按钮样式，与 Share 按钮保持一致
    return createPortal(
      <button
        type="button"
        className="btn btn-full-height"
        onClick={onClick}
      >
        <span 
          className="material-symbols align-middle" 
          aria-hidden="true" 
          translate="no"
        >
          smart_toy
        </span>
        <p className="toolbar-label">PacificOceanAI</p>
      </button>,
      host
    );
  }

  // 官方 Overleaf 的按钮样式
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
        PacificOceanAI
      </span>
    </button>,
    host
  );
};

export default ToolbarButtonPortal;

