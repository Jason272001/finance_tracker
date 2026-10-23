(function(){
  'use strict';if(document.documentElement.dataset.demo!=='workspace')return;
  document.addEventListener('DOMContentLoaded',()=>{
    const workspace=document.getElementById('businessWorkspace'),hub=document.getElementById('demoBusinessHub'),pos=document.getElementById('demoPos');if(!workspace||!hub||!pos)return;
    const groups={overview:['overview','analyst'],pos:[],team:['staff','schedule','time','meetings','tasks','branches'],finance:['budgets','tax'],growth:['marketing'],settings:[]};
    const names={overview:'Overview',pos:'POS',team:'Team',finance:'Finance',growth:'Marketing',settings:'Settings'};
    const defaults={overview:'overview',pos:'checkout',team:'staff',finance:'budgets',growth:'marketing',settings:'profile'};
    const remember={...defaults};let active='overview',routing=false;
    const profile=document.getElementById('businessProfileTitle').closest('.card'),access=document.getElementById('businessEmployeesTitle').closest('.card'),modules=document.getElementById('businessModulesTitle').closest('.card');
    const legacy={profile,access,modules};
    for(const [key,card] of Object.entries(legacy)){const wrapper=document.createElement('div');wrapper.dataset.businessScreen=key;card.before(wrapper);wrapper.append(card);legacy[key]=wrapper;wrapper.hidden=true;}
    const header=document.createElement('section');header.className='business-demo-header';
    header.innerHTML='<div class="business-demo-heading"><div><p class="pos-eyebrow">KEEPERBMA · BUSINESS DEMO</p><h2>Your business, organized</h2><p>Choose a workspace. Focus on one task at a time.</p></div><span class="business-demo-badge">Sample data · resets on refresh</span></div><nav class="business-category-nav" aria-label="Business categories">'+Object.entries(names).map(([key,label])=>`<button type="button" data-business-category="${key}" aria-pressed="${key===active}">${label}</button>`).join('')+'</nav><p id="businessBreadcrumb" class="business-breadcrumb" aria-live="polite"></p><nav id="businessExtraTools" class="pos-tabs" aria-label="Business settings tools" hidden><button type="button" data-business-screen="profile">Business profile</button><button type="button" data-business-screen="access">Employee access</button><button type="button" data-business-screen="modules">Feature availability</button></nav>';
    workspace.prepend(header);workspace.classList.add('business-demo-organized');
    const sidebar=document.createElement('aside');sidebar.className='business-sidebar';sidebar.setAttribute('aria-label','Business workspace navigation');
    sidebar.innerHTML='<div class="sidebar-brand"><span class="sidebar-mark">K</span><div>KeeperBMA<small>BUSINESS WORKSPACE</small></div></div><p class="sidebar-section-label">WORKSPACE</p><div class="sidebar-navigation-slot"></div><div class="sidebar-footer"><span class="sidebar-live-dot"></span> Interactive demo<p>Explore freely. Your sample changes reset on refresh.</p><a href="#demoMenu">Explore all demo tools ↗</a></div>';
    const categoryNav=header.querySelector('.business-category-nav');sidebar.querySelector('.sidebar-navigation-slot').append(categoryNav);
    const paths={overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',pos:'M3 4h18v12H3z M8 20h8 M12 16v4 M7 8h4 M7 12h8',team:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',finance:'M4 3h16v18H4z M8 7h8 M8 12h2 M14 12h2 M8 16h2 M14 16h2',growth:'M3 11v3h4l10 5V5L7 11H3z M7 14l2 7 M21 9v6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2'};
    for(const button of categoryNav.querySelectorAll('button')){const key=button.dataset.businessCategory;button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[key]+'"/></svg><span>'+names[key]+'</span>'; }
    const main=document.createElement('div');main.className='business-app-main';for(const child of [...workspace.children])if(!child.matches('.business-hero,#businessUpgradeCard'))main.append(child);workspace.append(sidebar,main);
    const hubNav=hub.querySelector('nav[aria-label="Business hub sections"]');
    hub.prepend(hubNav);
    // Keep the original controls in their event-delegation containers.
    function select(category,key,invoke=true){
      active=category;remember[category]=key;
      hub.dataset.businessCategory=category;
      workspace.querySelectorAll('[data-business-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.businessCategory===category)));
      hub.hidden=!groups[category]?.includes(key);pos.hidden=category!=='pos';
      for(const [name,wrapper] of Object.entries(legacy))wrapper.hidden=!(category==='settings'&&name===key);
      header.querySelector('#businessExtraTools').hidden=category!=='settings';
      header.querySelectorAll('[data-business-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.businessScreen===key)));
      hubNav.querySelectorAll('[data-hub-tab]').forEach(b=>b.hidden=!groups[category]?.includes(b.dataset.hubTab));
      hubNav.querySelectorAll('[data-hub-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.hubTab===key)));
      const label=category==='pos'?pos.querySelector(`[data-pos-tab="${key}"]`)?.textContent:category==='settings'?header.querySelector(`[data-business-screen="${key}"]`)?.textContent:hubNav.querySelector(`[data-hub-tab="${key}"]`)?.textContent;
      const titles={overview:'Business overview',pos:'Point of sale',team:'Team & operations',finance:'Business finances',growth:'Marketing workspace',settings:'Workspace settings'};
      header.querySelector('h2').textContent=titles[category];
      header.querySelector('.business-demo-heading > div > p:last-child').textContent={overview:'A clear view of your sample business.',pos:'Manage your catalog, purchases and sales.',team:'The right people, in the right place, at the right time.',finance:'Keep spending and preparation organized.',growth:'Plan campaigns and understand their results.',settings:'Manage your business profile and employee access.'}[category];
      header.querySelector('#businessBreadcrumb').textContent=label===names[category]?names[category]:names[category]+' / '+(label||key);
      if(invoke&&category!=='settings'){
        routing=true;
        const button=category==='pos'?pos.querySelector(`[data-pos-tab="${key}"]`):hubNav.querySelector(`[data-hub-tab="${key}"]`);button?.click();routing=false;
      }
    }
    function openHub(key,invoke=true){const category=Object.keys(groups).find(k=>groups[k].includes(key));if(category)select(category,key,invoke);}
    window.BusinessDemoLayout={hub:key=>openHub(key),pos:key=>select('pos',key||remember.pos),settings:key=>select('settings',key||'profile'),overview:()=>select('overview','overview')};
    workspace.addEventListener('click',e=>{const category=e.target.closest('[data-business-category]'),screen=e.target.closest('[data-business-screen]');if(category)select(category.dataset.businessCategory,remember[category.dataset.businessCategory]);if(screen)select('settings',screen.dataset.businessScreen);});
    document.addEventListener('click',e=>{if(routing)return;const quick=e.target.closest('[data-design-hub]');if(quick)openHub(quick.dataset.designHub);if(e.target.closest('[data-design-pos]'))select('pos','checkout');
      const hubButton=e.target.closest('[data-hub-tab]'),posButton=e.target.closest('[data-pos-tab]');if(hubButton)openHub(hubButton.dataset.hubTab,false);if(posButton)select('pos',posButton.dataset.posTab,false);},true);
    // Shortcuts stay available without occupying the whole landing screen.
    const directory=document.getElementById('demoMenu');
    for(const [aria,title] of [['Business demo shortcuts','All business tools'],['POS demo shortcuts','All POS tools']]){
      const nav=directory.querySelector(`nav[aria-label="${aria}"]`);if(!nav)continue;const heading=nav.previousElementSibling;const details=document.createElement('details');details.className='demo-tool-directory';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);heading.before(details);heading.remove();details.append(nav);
    }
    select(location.hash==='#demoPos'?'pos':'overview',location.hash==='#demoPos'?'checkout':'overview');
    if (['#demoPos','#demoBusinessHub'].includes(location.hash)) {
      window.addEventListener('load',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if (!workspace.classList.contains('hidden')) workspace.scrollIntoView({behavior:'auto',block:'start'});
      })),{once:true});
    }
  });
})();
