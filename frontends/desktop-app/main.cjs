'use strict';
const {app,BrowserWindow,Menu,shell,session}=require('electron');
const path=require('node:path');
const {HOME,internal,external}=require('./policy.cjs');
let window;
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  function open(){
    window=new BrowserWindow({width:1380,height:920,minWidth:850,minHeight:650,title:'KeeperBMA',icon:path.join(__dirname,'icons/app.png'),backgroundColor:'#f4f6fa',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:true}});
    window.once('ready-to-show',()=>window.show());
    window.webContents.on('will-navigate',(event,url)=>{if(!internal(url)){event.preventDefault();if(external(url))shell.openExternal(url);}});
    window.webContents.on('will-redirect',(event,url)=>{if(!internal(url))event.preventDefault();});
    window.webContents.setWindowOpenHandler(({url})=>{if(internal(url))window.loadURL(url);else if(external(url))shell.openExternal(url);return {action:'deny'};});
    window.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{if(isMainFrame&&code!==-3&&internal(url))window.loadFile(path.join(__dirname,'offline.html'));});
    window.loadURL(HOME);
    window.on('closed',()=>{window=null;});
  }
  app.whenReady().then(()=>{
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const template=[...(process.platform==='darwin'?[{role:'appMenu'}]:[]),{label:'KeeperBMA',submenu:[{label:'Home',click:()=>window?.loadURL(HOME)},{label:'Business demo',click:()=>window?.loadURL(HOME+'demo.html#demoBusinessHub')},{label:'Reload',role:'reload'},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},{role:'windowMenu'},{label:'Help',submenu:[{label:'Desktop preview notes',click:()=>shell.openExternal(HOME+'#desktop')},{label:'Visit website',click:()=>shell.openExternal(HOME)}]}];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));open();
    app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)open();});
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
