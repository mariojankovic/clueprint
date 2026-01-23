/**
 * DevTools Entry Point
 * Creates the DevTools panel for detailed network access
 */

chrome.devtools.panels.create(
  'Clueprint',
  '',
  'devtools/panel.html',
  (panel) => {
    console.log('[Clueprint] Panel created');
  }
);
