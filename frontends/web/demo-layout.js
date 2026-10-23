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
    const hubNav=hub.querySelector('nav[aria-label="Business hub sections"]');
    hub.prepend(hubNav);
    // Keep the original controls in their event-delegation containers.
    function select(category,key,invoke=true){
      active=category;remember[category]=key;
      hub.dataset.businessCategory=category;
      header.querySelectorAll('[data-business-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.businessCategory===category)));
      hub.hidden=!groups[category]?.includes(key);pos.hidden=category!=='pos';
      for(const [name,wrapper] of Object.entries(legacy))wrapper.hidden=!(category==='settings'&&name===key);
      header.querySelector('#businessExtraTools').hidden=category!=='settings';
      header.querySelectorAll('[data-business-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.businessScreen===key)));
      hubNav.querySelectorAll('[data-hub-tab]').forEach(b=>b.hidden=!groups[category]?.includes(b.dataset.hubTab));
      const label=category==='pos'?pos.querySelector(`[data-pos-tab="${key}"]`)?.textContent:category==='settings'?header.querySelector(`[data-business-screen="${key}"]`)?.textContent:hubNav.querySelector(`[data-hub-tab="${key}"]`)?.textContent;
      header.querySelector('#businessBreadcrumb').textContent=label===names[category]?names[category]:names[category]+' / '+(label||key);
      if(invoke&&category!=='settings'){
        routing=true;
        const button=category==='pos'?pos.querySelector(`[data-pos-tab="${key}"]`):hubNav.querySelector(`[data-hub-tab="${key}"]`);button?.click();routing=false;
      }
    }
    function openHub(key,invoke=true){const category=Object.keys(groups).find(k=>groups[k].includes(key));if(category)select(category,key,invoke);}
    window.BusinessDemoLayout={hub:key=>openHub(key),pos:key=>select('pos',key||remember.pos),settings:key=>select('settings',key||'profile'),overview:()=>select('overview','overview')};
    header.addEventListener('click',e=>{const category=e.target.closest('[data-business-category]'),screen=e.target.closest('[data-business-screen]');if(category)select(category.dataset.businessCategory,remember[category.dataset.businessCategory]);if(screen)select('settings',screen.dataset.businessScreen);});
    document.addEventListener('click',e=>{if(routing)return;const hubButton=e.target.closest('[data-hub-tab]'),posButton=e.target.closest('[data-pos-tab]');if(hubButton)openHub(hubButton.dataset.hubTab,false);if(posButton)select('pos',posButton.dataset.posTab,false);},true);
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
