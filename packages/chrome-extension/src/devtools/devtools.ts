/**
 * DevTools Entry Point
 * Creates the DevTools panel for detailed network access
 */

chrome.devtools.panels.create(
  'AI DevTools',
  '',
  'devtools/panel.html',
  (panel) => {
    console.log('[AI DevTools] Panel created');
  }
);
