(function () {
  'use strict';

  const injectTime = performance.now();
  (async () => {
    const { onExecute } = await import(
      /* @vite-ignore */
      chrome.runtime.getURL("assets/main.tsx-DsRm8Ej5.js")
    );
    onExecute?.({ perf: { injectTime, loadTime: performance.now() - injectTime } });
  })().catch(console.error);

})();
