import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('petMessage',{close:()=>ipcRenderer.send('pet-message-close'),hover:(inside:boolean)=>ipcRenderer.send('pet-message-hover',inside),subscribe:(fn:(message:unknown)=>void)=>ipcRenderer.on('pet-message-state',(_event,message)=>fn(message))});
