'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pk', {
  onTabs: (cb) => ipcRenderer.on('tabs', (_e, data) => cb(data)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data)),
  ready: () => ipcRenderer.send('ui-ready'),
  select: (id) => ipcRenderer.send('select', id),
  reload: () => ipcRenderer.send('reload-active'),
  action: (name, args) => ipcRenderer.send('action', name, args),
  togglePanel: () => ipcRenderer.send('toggle-panel'),
  hideHub: () => ipcRenderer.send('hide-hub'),
  setConfig: (key, value) => ipcRenderer.send('set-config', key, value),
  resetApprovals: () => ipcRenderer.send('reset-approvals'),




  setAuto: (key, on) => ipcRenderer.send('set-auto', key, on),
  quit: () => ipcRenderer.send('quit'),
});
