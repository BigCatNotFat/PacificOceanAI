import { RefObject, useEffect } from 'react';
import { CLASSES, ELEMENTS, SIDEBAR_CONFIG } from '../../base/common/constants';
import { disableIframes, getMainContainer, triggerResize } from '../../base/browser/dom';

type Params = {
  sidebarRef: RefObject<HTMLDivElement>;
  handleRef: RefObject<HTMLDivElement>;
  onWidthChange: (width: number) => void;
};

export function useSidebarResize({ sidebarRef, handleRef, onWidthChange }: Params) {
  useEffect(() => {
    const handle = handleRef.current;
    const sidebar = sidebarRef.current;
    if (!handle || !sidebar) return;

    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`.${ELEMENTS.TOGGLER_BTN_CLASS}`)) return;

      dragging = true;
      startX = e.clientX;
      startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);

      handle.classList.add(CLASSES.RESIZING);
      document.body.style.cursor = 'ew-resize';
      disableIframes(true);

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;

      const mainContainer = getMainContainer();
      const parent =
        (mainContainer.parentElement as HTMLElement | null) ?? (document.body as HTMLElement);
      const parentWidth = parent.clientWidth || window.innerWidth;
      const maxWidth = Math.max(SIDEBAR_CONFIG.MIN_WIDTH, parentWidth);

      let newWidth = startWidth + (startX - e.clientX);
      if (newWidth < SIDEBAR_CONFIG.MIN_WIDTH) newWidth = SIDEBAR_CONFIG.MIN_WIDTH;
      if (newWidth > maxWidth) newWidth = maxWidth;

      onWidthChange(newWidth);
      sidebar.style.width = `${newWidth}px`;
      mainContainer.style.width = `calc(100% - ${newWidth}px)`;
    };

    const onMouseUp = () => {
      if (!dragging) return;

      dragging = false;
      handle.classList.remove(CLASSES.RESIZING);
      document.body.style.cursor = 'default';
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
  }, [handleRef, onWidthChange, sidebarRef]);
}
