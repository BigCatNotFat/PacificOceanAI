import React, { useEffect, useState } from 'react';
import { SIDEBAR_CONFIG } from '../config/constants';
import { getMainContainer, setTransition, triggerResize } from '../utils/dom';
import Sidebar from '../components/Sidebar';
import ToolbarButtonPortal from '../components/ToolbarButtonPortal';

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(SIDEBAR_CONFIG.DEFAULT_WIDTH);

  useEffect(() => {
    const mainContainer = getMainContainer();
    if (!mainContainer) return;

    setTransition(mainContainer, 'width 0.2s ease', SIDEBAR_CONFIG.ANIMATION_DURATION);
    if (isOpen) {
      mainContainer.style.width = `calc(100% - ${currentWidth}px)`;
    } else {
      mainContainer.style.width = '';
    }

    const timer = window.setTimeout(() => {
      triggerResize();
    }, SIDEBAR_CONFIG.ANIMATION_DURATION);

    return () => window.clearTimeout(timer);
  }, [isOpen, currentWidth]);

  const toggleSidebar = () => setIsOpen((prev) => !prev);
  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      <ToolbarButtonPortal onClick={toggleSidebar} />
      <Sidebar
        isOpen={isOpen}
        width={currentWidth}
        onToggle={toggleSidebar}
        onClose={closeSidebar}
        onWidthChange={setCurrentWidth}
      />
    </>
  );
};

export default App;
