export const SIDEBAR_CONFIG = {
  DEFAULT_WIDTH: 360,
  MIN_WIDTH: 260,
  MAX_WIDTH: 800,
  ANIMATION_DURATION: 250
};

export const ELEMENTS = {
  SIDEBAR_ID: 'overleaf-ai-sidebar',
  STYLE_ID: 'ai-sidebar-style',
  BUTTON_WRAPPER_ID: 'overleaf-ai-wrapper',
  RESIZE_HANDLE_CLASS: 'ai-resize-handle',
  TOGGLER_BTN_CLASS: 'ai-toggler-btn'
};

/**
 * 支持的网站类型
 * - official: 官方 Overleaf (www.overleaf.com)
 * - sysu: 中山大学 LaTeX (latex.sysu.edu.cn)
 * - custom: 自建 Overleaf 服务器 (192.168.124.22:3000)
 */
export type SiteType = 'official' | 'sysu' | 'custom';

/**
 * 检测当前网站类型
 */
export function detectSiteType(): SiteType {
  const hostname = window.location.hostname;
  
  if (hostname === 'www.overleaf.com' || hostname === 'overleaf.com') {
    return 'official';
  }
  if (hostname === 'latex.sysu.edu.cn') {
    return 'sysu';
  }
  // 自建服务器和其他兼容的 Overleaf 部署
  return 'custom';
}

export const SELECTORS = {
  MAIN_CONTAINER: 'main',
  LAYOUT_ROOT: '.layout-root',
  // 官方 Overleaf 的工具栏按钮容器
  TOOLBAR_BUTTON: '.ide-redesign-toolbar-button-container',
  // 自建/高校版 Overleaf 的 Share 按钮（用于定位插入位置）
  SHARE_BUTTON: 'button.btn.btn-full-height',
  // 自建/高校版 Overleaf 的工具栏
  TOOLBAR_GROUP: '.toolbar-right',
  // 额外的备用选择器
  TOOLBAR_HEADER: '.toolbar.toolbar-header'
};

export const CLASSES = {
  RESIZING: 'resizing',
  BTN_PRIMARY: 'd-inline-grid btn btn-primary btn-sm',
  TOOLBAR_CONTAINER: 'ide-redesign-toolbar-button-container',
  // 自建/高校版按钮样式
  BTN_FULL_HEIGHT: 'btn btn-full-height'
};

