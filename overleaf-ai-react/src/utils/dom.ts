import { SELECTORS } from '../config/constants';

export function getMainContainer(): HTMLElement {
  return (
    (document.querySelector(SELECTORS.MAIN_CONTAINER) as HTMLElement | null) ||
    (document.querySelector(SELECTORS.LAYOUT_ROOT) as HTMLElement | null) ||
    document.body
  );
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
