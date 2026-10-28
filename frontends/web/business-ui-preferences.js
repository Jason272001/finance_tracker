(function(){
 'use strict';
 const root=document.documentElement;
 function preference(){try{return localStorage.getItem('keeperbma_theme')==='dark'?'dark':'light';}catch(_){return 'light';}}
 function apply(theme){root.dataset.theme=theme;const button=document.getElementById('businessTheme');if(button){button.textContent=theme==='dark'?'Light mode':'Dark mode';button.setAttribute('aria-pressed',String(theme==='dark'));}}
 apply(preference());
 document.addEventListener('DOMContentLoaded',()=>{
  const shell=document.querySelector('.station-shell');if(!shell)return;
  const header=shell.querySelector('.station-header')||shell;let actions=header.querySelector(':scope > .station-actions');if(!actions){actions=document.createElement('div');actions.className='station-actions';for(const link of header.querySelectorAll(':scope > a'))actions.append(link);header.append(actions);}
  const button=document.createElement('button');button.id='businessTheme';button.type='button';button.className='secondary business-theme';button.setAttribute('aria-label','Toggle dark mode');actions.append(button);apply(preference());
  button.onclick=()=>{const next=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('keeperbma_theme',next);}catch(_){}apply(next);};
  const seen=new Set(),observer=new ResizeObserver(entries=>{for(const {target} of entries){const overflow=target.clientWidth>0&&target.scrollWidth>target.clientWidth+1;target.toggleAttribute('data-overflow',overflow);if(overflow){target.tabIndex=0;target.setAttribute('role','region');target.setAttribute('aria-label',(target.closest('[data-ops-panel]')?.querySelector('h3')?.textContent||'Records')+' table - scroll for more columns');}else{target.removeAttribute('tabindex');target.removeAttribute('role');target.removeAttribute('aria-label');}}});
  let queued=false;function scan(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;for(const target of seen)if(!target.isConnected){observer.unobserve(target);seen.delete(target);}for(const table of document.querySelectorAll('.ops-table'))if(!seen.has(table)){seen.add(table);observer.observe(table);}});}
  new MutationObserver(scan).observe(shell,{childList:true,subtree:true});scan();
 });
 window.addEventListener('storage',event=>{if(event.key==='keeperbma_theme')apply(preference());});
})();
