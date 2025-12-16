import { SELECTORS, detectSiteType } from '../common/constants';

/**
 * 获取主内容容器
 * 不同版本的 Overleaf 可能有不同的 DOM 结构
 */
export function getMainContainer(): HTMLElement {
  const siteType = detectSiteType();
  
  // 官方 Overleaf 的选择器
  const officialSelectors = [
    SELECTORS.MAIN_CONTAINER,
    SELECTORS.LAYOUT_ROOT,
  ];
  
  // 自建/高校版 Overleaf 的选择器
  const customSelectors = [
    '.ide-react-main',
    '.editor-container',
    '.ide-body',
    '#ide-body',
    '.full-size',
    SELECTORS.MAIN_CONTAINER,
    SELECTORS.LAYOUT_ROOT,
  ];
  
  const selectors = siteType === 'official' ? officialSelectors : customSelectors;
  
  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (element) {
      return element;
    }
  }
  
  // 最后的备用方案
  return document.body;
}

export function disableIframes(disable: boolean): void {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    (iframe as HTMLIFrameElement).style.pointerEvents = disable ? 'none' : 'auto';
  });
}

export function triggerResize(): void {
  window.dispatchEvent(new Event('resize'));
}

export function setTransition(element: HTMLElement, transition: string, duration: number): void {
  element.style.transition = transition;
  setTimeout(() => {
    element.style.transition = 'none';
  }, duration);
}
