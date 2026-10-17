const { GameApp } = await import('./gameApp.js?ver='+window.srcVersion);
const { appPlatform } = await import('./appPlatform.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
// begin code

var gameApp = new GameApp(appPlatform(), window.importPath, window.wsURL, window.devModeName, window.appIconSprite);

// animation loop
function loopGame(timestamp) {
  gameApp.loopApp(timestamp);
  requestAnimationFrame(loopGame);
} // loopGame

// events processing
window.addEventListener('keydown', (event) => gameApp.inputEventsManager.eventKeyDown(event));
window.addEventListener('keyup', (event) => gameApp.inputEventsManager.eventKeyUp(event));
window.addEventListener('click', (event) => gameApp.inputEventsManager.eventClick(event));
window.addEventListener('contextmenu', (event) => gameApp.inputEventsManager.eventContextMenu(event));
window.addEventListener('mousedown', (event) => gameApp.inputEventsManager.eventMouseDown(event));
window.addEventListener('mouseup', (event) => gameApp.inputEventsManager.eventMouseUp(event));
window.addEventListener('mousemove', (event) => gameApp.inputEventsManager.eventMouseMove(event));
window.addEventListener('wheel', (event) => gameApp.inputEventsManager.eventWheel(event));
window.addEventListener('touchstart', (event) => gameApp.inputEventsManager.eventTouchStart(event));
window.addEventListener('touchend', (event) => gameApp.inputEventsManager.eventTouchEnd(event));
window.addEventListener('touchcancel', (event) => gameApp.inputEventsManager.eventTouchEnd(event));
window.addEventListener('touchmove', (event) => gameApp.inputEventsManager.eventTouchMove(event));
window.addEventListener('blur', (event) => gameApp.inputEventsManager.eventBlurWindow(event));
window.addEventListener('focus', (event) => gameApp.inputEventsManager.eventFocusWindow(event));
window.addEventListener('resize', (event) => gameApp.eventResizeWindow(event));

if (navigator.getGamepads) {
  gameApp.controls.gamepads.supported = true;
}

if (window.matchMedia('(pointer: coarse)').matches) {
  gameApp.controls.touchscreen.supported = true;
}

// disable gesture on Safari mobile
document.addEventListener("gesturestart", (event) => event.preventDefault());
document.addEventListener("gestureend", (event) => event.preventDefault());
document.addEventListener("gesturechange", (event) => event.preventDefault());

// prevent accidental back navigation (mouse back button, touchpad swipe, Backspace):
// a sentinel history entry swallows the back action; leaving is confirmed by a dialog.
// The sentinel is pushed on the first user interaction, not at load: Firefox and
// Chrome skip history entries created without user activation (back-trapping
// protection), so a sentinel pushed at load would be bypassed by the back button.
history.replaceState({backGuard: 'base'}, "", location.href);
const armBackGuard = () => {
  if (!history.state || history.state.backGuard !== 'sentinel') {
    history.pushState({backGuard: 'sentinel'}, "", location.href);
  }
};
window.addEventListener('pointerdown', armBackGuard);
window.addEventListener('keydown', armBackGuard);
window.addEventListener('touchstart', armBackGuard);
let leavingApp = false;
// restored from bfcache (browser forward back into the game): module state survived,
// so reset the leave flag; the next interaction re-arms the sentinel via armBackGuard
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    leavingApp = false;
  }
});
window.addEventListener("popstate", (event) => {
  if (leavingApp) {
    history.back(); // keep walking back until we leave the document
    return;
  }
  if (event.state && event.state.backGuard === 'sentinel') {
    return; // initial popstate fired by some engines on page load
  }
  if (window.confirm('Do you really want to leave the game?')) {
    leavingApp = true;
    history.back();
  } else {
    history.pushState({backGuard: 'sentinel'}, "", location.href);
  }
});

// start game
gameApp.eventResizeWindow(null);
requestAnimationFrame(loopGame);

// register service worker when enabled: in production (devMode === false) or in
// dev mode carrying the serviceWorker flag (devMode = {serviceWorker: true});
// plain dev mode (devMode === true) unregisters and bypasses the SW
if ('serviceWorker' in navigator) {
  const dm = window.devMode;
  // an explicit disableServiceWorker cookie (toggled from the /config page) forces the SW off
  const swDisabled = Tool.readCookie('disableServiceWorker', false) === 'true';
  const swEnabled = !swDisabled && (!dm || (typeof dm === 'object' && dm.serviceWorker));
  if (swEnabled) {
    // intentionally no auto-reload on controllerchange: on flaky old engines it
    // re-fires on every load, which caused an infinite reload loop. The updated
    // SW installs in the background and waits; the new version takes effect via
    // the in-app upgrade (menu UPGRADE button) or on the next launch after all
    // tabs are closed.
    navigator.serviceWorker.register('serviceWorker', { type: 'module' }).catch((error) => console.error('service worker registration failed:', error));
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((reg) => reg.unregister()));
  }
}
