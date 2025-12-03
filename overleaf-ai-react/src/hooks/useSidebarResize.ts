import { RefObject, useEffect } from 'react';
import { CLASSES, ELEMENTS, SIDEBAR_CONFIG } from '../config/constants';
import { disableIframes, getMainContainer, triggerResize } from '../utils/dom';

type Params = {
  sidebarRef: RefObject<HTMLDivElement>;
  handleRef: RefObject<HTMLDivElement>;
  width: number;
  onWidthChange: (width: number) => void;
};

export function useSidebarResize({ sidebarRef, handleRef, width, onWidthChange }: Params) {
  useEffect(() => {
    const handle = handleRef.current;
    const sidebar = sidebarRef.current;
    if (!handle || !sidebar) return;

    let startX = 0;
    let startWidth = width;
    let dragging = false;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`.${ELEMENTS.TOGGLER_BTN_CLASS}`)) return;

      dragging = true;
      startX = e.clientX;
      startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);

      document.documentElement.style.cursor = 'col-resize';
      handle.classList.add(CLASSES.RESIZING);
      disableIframes(true);

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;

      let newWidth = startWidth + (startX - e.clientX);
      if (newWidth < SIDEBAR_CONFIG.MIN_WIDTH) newWidth = SIDEBAR_CONFIG.MIN_WIDTH;
      if (newWidth > SIDEBAR_CONFIG.MAX_WIDTH) newWidth = SIDEBAR_CONFIG.MAX_WIDTH;

      onWidthChange(newWidth);
      sidebar.style.width = `${newWidth}px`;

      const mainContainer = getMainContainer();
      mainContainer.style.width = `calc(100% - ${newWidth}px)`;
    };

    const onMouseUp = () => {
      if (!dragging) return;

      dragging = false;
      document.documentElement.style.cursor = 'default';
      handle.classList.remove(CLASSES.RESIZING);
      disableIframes(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      triggerResize();
    };

    handle.addEventListener('mousedown', onMouseDown);

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleRef, onWidthChange, sidebarRef, width]);
}
