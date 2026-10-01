// Toolbar button: clicking it turns the extension on/off everywhere (no popup), like a light switch.
// The state lives in storage so content scripts in open tabs react immediately via storage.onChanged.
const icons = on => Object.fromEntries([16, 32, 48, 128].map(s => [s, `icons/icon${on ? '' : '-off'}-${s}.png`]));

async function sync() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.action.setIcon({ path: icons(enabled) });
  await chrome.action.setTitle({ title: `Better DataFusion Bots: ${enabled ? 'on (click to turn off)' : 'off (click to turn on)'}` });
}

async function toggle() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.storage.local.set({ enabled: !enabled });
}

chrome.action.onClicked.addListener(toggle);
chrome.storage.onChanged.addListener(changes => { if ('enabled' in changes) sync(); });
// The icon set by setIcon doesn't survive a browser restart; re-apply whenever the worker starts.
sync();
