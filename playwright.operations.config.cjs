const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests/browser-operations',workers:1,timeout:45000,
 use:{baseURL:'http://127.0.0.1:8767',viewport:{width:1280,height:900},trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium',channel:process.platform==='win32'?'msedge':undefined}},{name:'webkit',use:{browserName:'webkit'}}],
 webServer:{command:(process.platform==='win32'?'"'+require('node:path').resolve('.venv/Scripts/python.exe')+'"':'python3')+' tests/operations_browser_server.py',port:8767,reuseExistingServer:false,env:{KEEPERBMA_OPERATIONS_BROWSER_TEST:'1'},...(process.platform==='win32'?{}:{gracefulShutdown:{signal:'SIGTERM',timeout:10000}})}
});
