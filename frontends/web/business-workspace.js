/* Signed-in navigation around the existing persisted account services.
   Demo operations stay on demo.html; this file never invents business data. */
(function(){
  'use strict';
  if(document.documentElement.dataset.demo)return;
  document.addEventListener('DOMContentLoaded',()=>{
    const $=id=>document.getElementById(id),workspace=$('businessWorkspace');if(!workspace)return;
    const profile=$('businessProfileTitle').closest('.card'),team=$('businessEmployeesTitle').closest('.card'),modules=$('businessModulesTitle').closest('.card');
    const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const icons={overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',pos:'M3 4h18v12H3z M8 20h8 M12 16v4 M7 8h4 M7 12h8',team:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',finance:'M4 3h16v18H4z M8 7h8 M8 12h2 M14 12h2 M8 16h2 M14 16h2',marketing:'M3 11v3h4l10 5V5L7 11H3z M7 14l2 7 M21 9v6',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6'};
    const names={overview:'Home',team:'Staff',finance:'Finance',settings:'Business profile'};
    const heading={overview:'Your business, organized',pos:'Point of sale',team:'Your team',finance:'Finance',marketing:'Marketing',settings:'Business settings'};
    let current='overview',editorOpen=false,lastBusinessId=null,lastSavedBusinessId=0,wasCreating=false,creationNotice=0;
    workspace.classList.add('live-business-workspace');
    workspace.querySelector('.business-hero').hidden=true;
    const sidebar=document.createElement('aside');sidebar.className='live-sidebar';
    sidebar.innerHTML='<div class="live-brand"><span>K</span><div>KeeperBMA<small>BUSINESS WORKSPACE</small></div></div><nav aria-label="Business workspace">'+Object.entries(names).map(([key,name])=>'<button type="button" data-live-screen="'+key+'" aria-current="'+(key==='overview'?'page':'false')+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="'+icons[key]+'"/></svg>'+name+'</button>').join('')+'</nav><div class="live-sidebar-foot">Your signed-in workspace<p>Your business profile and staff records are saved to your account.</p></div>';
    const main=document.createElement('div');main.className='live-business-main';
    main.innerHTML='<header class="live-header"><div><p class="live-eyebrow">KEEPERBMA · YOUR BUSINESS</p><h1 id="liveBusinessTitle">Your business, organized</h1><p id="liveBusinessSubtitle">One workspace. One task at a time.</p></div><div class="live-theme" role="group" aria-label="Business color theme"><button type="button" data-live-theme="light">Light</button><button type="button" data-live-theme="dark">Dark</button></div></header><div class="live-business-context"><nav id="liveBusinessChoices" aria-label="Your businesses"></nav><div id="liveNewBusinessSlot"></div></div><p id="liveLoadStatus" role="status" aria-live="polite"></p><div id="liveBusinessAccess"></div><div id="liveScreenHeading" class="live-breadcrumb">Business / Overview</div><div id="liveBusinessPanels"></div>';
    workspace.append(sidebar,main);main.querySelector('#liveBusinessAccess').append($('businessUpgradeCard'));main.querySelector('#liveNewBusinessSlot').append($('btnNewBusiness'));
    $('businessSelect').hidden=true;$('businessSelect').setAttribute('aria-label','Selected business');
    const panels=$('liveBusinessPanels');
    panels.innerHTML='<section data-live-panel="overview"><div class="live-overview-title"><h2 id="liveOverviewGreeting">Your business</h2><p id="liveHomeHint">Choose what you want to do.</p></div><div id="liveFirstBusiness" class="live-setup-card" hidden><h3>Let’s set up your business</h3><p>You only need a name and business type. Add other details whenever you’re ready.</p><button type="button" id="liveCreateBusinessStart">Create my business</button></div><div id="liveBusinessMetrics" class="live-metrics"></div><div id="liveHomeActions" class="live-action-grid"><button type="button" data-live-action="profile"><strong>Business profile</strong><span>Update your business details.</span><b>Edit profile →</b></button><button type="button" data-live-screen="team"><strong>Staff</strong><span>Add people and manage their details.</span><b>Manage staff →</b></button><button type="button" data-live-screen="finance"><strong>Finance</strong><span>Open your accounts, transactions and reports.</span><b>Open finance →</b></button></div></section><section data-live-panel="team" hidden><div id="liveStaffRecords"></div></section><section data-live-panel="finance" hidden><div class="live-section-intro"><h2>Accounts, transactions & reports</h2><p>These records are shared with Personal mode and are not separated by business. Opening a tool switches to Personal mode.</p></div><div class="live-finance-links">'+[['accountsTitle','Accounts & balances'],['transactionsTitle','Transactions'],['creatorReport','Monthly report'],['summaryExportTitle','Charts & PDF export']].map(([id,name])=>'<button type="button" data-live-finance="'+id+'">'+name+' →</button>').join('')+'</div></section><section data-live-panel="settings" hidden><div id="liveProfile"></div></section>';
    $('liveProfile').append(profile);$('liveStaffRecords').append(team);
    const unavailable=document.createElement('div');unavailable.hidden=true;unavailable.append(modules);workspace.append(unavailable);
    // Always-visible labels; supplementary publishing fields stay out of the basic form.
    const labels={businessName:'Business name',businessType:'Business type',businessIndustry:'Industry',businessPhone:'Business phone',businessEmail:'Business email',businessAddress:'Business address',businessPageSlug:'Business page slug',businessWebsiteSlug:'Website slug',businessLogoUrl:'Logo URL',businessCoverUrl:'Cover image URL',businessAboutText:'About your business',businessEmployeeName:'Staff name',businessEmployeeEmail:'Staff email',businessEmployeePhone:'Staff phone',businessEmployeeRole:'Role',businessEmployeeStatus:'Status'};
    for(const [id,text] of Object.entries(labels)){const input=$(id);if(input&&!input.closest('label')){const label=document.createElement('label');label.className='live-field';const caption=document.createElement('span');caption.id=id+'Caption';caption.textContent=text;label.append(caption);input.setAttribute('aria-labelledby',caption.id);input.before(label);label.append(input);}}
    const businessForm=document.createElement('form');businessForm.id='liveBusinessForm';
    const profileHeader=profile.querySelector('.section-head');
    for(const child of [...profile.children])if(child!==profileHeader)businessForm.append(child);
    profile.append(businessForm);
    const optional=document.createElement('details');optional.id='liveOptionalBusiness';optional.className='live-advanced';optional.innerHTML='<summary>Contact details (optional)</summary>';
    $('businessPhone').closest('.row').before(optional);
    optional.append($('businessPhone').closest('.row'));
    const industry=$('businessIndustry').closest('label');optional.append(industry);
    optional.append($('businessAboutText').closest('.row'));
    const privateFields=document.createElement('div');privateFields.hidden=true;
    for(const id of ['businessPageSlug','businessLogoUrl','businessPageEnabled'])privateFields.append($(id).closest('.row,.business-inline-grid'));
    businessForm.append(privateFields);
    $('businessName').required=true;$('businessName').maxLength=120;
    $('businessName').placeholder='Example: Sunrise Café';
    $('btnSaveBusiness').type='submit';
    businessForm.onsubmit=e=>{e.preventDefault();if(businessForm.reportValidity())$('btnSaveBusiness').click();};
    const cancelBusiness=document.createElement('button');cancelBusiness.id='liveCancelBusiness';cancelBusiness.type='button';cancelBusiness.className='secondary';cancelBusiness.textContent='Cancel';$('btnSaveBusiness').after(cancelBusiness);
    // Staff list first; the editor opens only when requested.
    const teamHeader=team.querySelector('.section-head');$('businessEmployeeSelect').hidden=true;$('businessEmployeeSelect').setAttribute('aria-label','Selected employee');
    const staffNotice=document.createElement('p');staffNotice.className='live-explanation';staffNotice.textContent='Add a staff member, then choose their role and access permissions.';teamHeader.after(staffNotice);
    const editor=document.createElement('div');editor.id='liveStaffEditor';editor.hidden=true;
    for(const child of [...team.children])if(![teamHeader,staffNotice,$('businessEmployeesList'),$('businessEmployeeStatusMsg')].includes(child))editor.append(child);
    team.append($('businessEmployeesList'),editor,$('businessEmployeeStatusMsg'));
    const permissions=editor.querySelector('.business-permissions-grid'),permissionDetails=document.createElement('details');permissionDetails.className='live-advanced';permissionDetails.innerHTML='<summary>Advanced role permissions</summary>';permissions.before(permissionDetails);permissionDetails.append(permissions);
    const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Close editor';cancel.onclick=()=>{editorOpen=false;view();};editor.append(cancel);
    function view(){
      workspace.querySelectorAll('[data-live-panel]').forEach(p=>p.hidden=p.dataset.livePanel!==current);
      sidebar.querySelectorAll('[data-live-screen]').forEach(b=>b.setAttribute('aria-current',b.dataset.liveScreen===current?'page':'false'));
      $('liveBusinessTitle').textContent=heading[current];$('liveScreenHeading').textContent='Business / '+names[current];
      editor.hidden=!editorOpen;
    }
    function navigate(screen){if(!names[screen])return;current=screen;view();}
    workspace.addEventListener('click',e=>{
      const button=e.target.closest('button');if(!button)return;creationNotice=0;
      if(button.dataset.liveScreen)navigate(button.dataset.liveScreen);
      if(button.dataset.liveAction==='profile')navigate('settings');
      if(button.dataset.liveTheme){window.applyTheme(button.dataset.liveTheme);syncTheme();}
      if(button.hasAttribute('data-live-business')){const select=$('businessSelect');select.value=button.dataset.liveBusiness;select.dispatchEvent(new Event('change'));}
      if(button.dataset.liveFinance){window.setAppMode('personal');$(button.dataset.liveFinance)?.scrollIntoView({behavior:'auto',block:'start'});}
      if(button.id==='btnNewBusiness'){optional.open=false;navigate('settings');$('businessName').focus();}
      if(button.id==='liveCreateBusinessStart')$('btnNewBusiness').click();
      if(button.id==='liveCancelBusiness'){const select=$('businessSelect');select.value=String(lastSavedBusinessId||0);select.dispatchEvent(new Event('change'));navigate('overview');}
      if(button.id==='btnNewEmployee'){editorOpen=true;view();$('businessEmployeeName').focus();}
      if(button.id==='liveRetryBusiness')window.refreshAll();
      if(button.id==='liveRetryStaff')window.refreshBusinessEmployeesForSelection();
    });
    function syncTheme(){main.querySelectorAll('[data-live-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.liveTheme===document.documentElement.dataset.theme)));}
    new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});syncTheme();
    window.LiveBusinessWorkspace={
      mode:enabled=>document.body.classList.toggle('live-business-mode',enabled),
      editEmployee:()=>{current='team';editorOpen=true;view();$('businessEmployeeName').focus();},
      render(snapshot){
        const business=snapshot.business,id=business?.business_id||0;
        document.body.classList.toggle('live-business-creating',snapshot.creating);
        if(id!==lastBusinessId){editorOpen=false;lastBusinessId=id;}
        const created=wasCreating&&!snapshot.creating&&business&&id!==lastSavedBusinessId;
        if(id)lastSavedBusinessId=id;
        if(created){current='overview';creationNotice=id;}
        wasCreating=snapshot.creating;
        $('liveBusinessChoices').innerHTML=snapshot.businesses.map(b=>'<button type="button" data-live-business="'+Number(b.business_id)+'" aria-pressed="'+(Number(b.business_id)===Number(id))+'" '+(!snapshot.access?'disabled':'')+'>'+esc(b.business_name)+'</button>').join('');
        $('liveBusinessSubtitle').textContent=snapshot.creating?'Create a new business':business?business.business_name+' · '+(business.is_owner?'Owner workspace':'Shared workspace'):'Your signed-in business workspace';
        $('liveLoadStatus').innerHTML=snapshot.error?esc(snapshot.error)+' <button type="button" id="liveRetryBusiness">Retry loading</button>':!snapshot.access?'Your current account does not have active business workspace access.':!snapshot.loaded?'Loading your businesses…':snapshot.creating?'':!business?'':'';
        if(creationNotice===id&&id&&current==='overview'&&!snapshot.error)$('liveLoadStatus').textContent='Business created. You’re ready to go.';
        $('liveOverviewGreeting').textContent=business?business.business_name:'Welcome';
        const empty=snapshot.loaded&&!business&&!snapshot.creating&&!snapshot.error&&snapshot.access;
        $('liveFirstBusiness').hidden=!empty;$('liveHomeActions').hidden=!business;$('liveBusinessMetrics').hidden=!business;
        $('liveHomeHint').hidden=empty;
        $('businessProfileTitle').textContent=snapshot.creating?'Create your business':'Business profile';
        $('businessProfileHint').textContent=snapshot.creating?'Name your business and choose its type. That’s all you need to start.':'Keep your business details up to date.';
        $('btnSaveBusiness').textContent=snapshot.creating?'Create business':'Save changes';
        $('liveCancelBusiness').hidden=!snapshot.creating;
        $('btnNewBusiness').hidden=snapshot.creating||empty;

        $('liveBusinessMetrics').innerHTML=[['Business profiles',snapshot.loaded?snapshot.businesses.length:'—'],['Staff in this business',snapshot.employeesLoaded?snapshot.employees.length:'—'],['Account finance tools',snapshot.financesLoaded?'Available':'Not loaded']].map(([label,value])=>'<article><span>'+label+'</span><strong>'+esc(value)+'</strong></article>').join('');
        const old=$('liveStaffLoadStatus');if(old)old.remove();
        if(snapshot.employeesError||business&&!snapshot.employeesLoaded){const note=document.createElement('p');note.id='liveStaffLoadStatus';note.setAttribute('role','status');note.innerHTML=snapshot.employeesError?esc(snapshot.employeesError)+' <button type="button" id="liveRetryStaff">Retry staff</button>':'Loading staff records…';staffNotice.after(note);}
        $('businessEmployeesList').hidden=!!snapshot.employeesError||!!business&&!snapshot.employeesLoaded;
        $('btnDeleteEmployee').hidden=!snapshot.selectedEmployee;
        $('btnNewBusiness').textContent='+ Add business';
        $('businessEmployeesTitle').textContent='Staff';
        $('businessEmployeesHint').textContent='People who work in this business.';
        $('btnNewEmployee').textContent='Add staff';
        $('btnSaveEmployee').textContent=snapshot.selectedEmployee?'Save staff':'Add staff';
        // Publishing services are not live; do not imply enabling a checkbox publishes a site.
        $('businessPageEnabled').disabled=true;$('businessWebsiteEnabled').disabled=true;
        view();this.mode(snapshot.mode==='business'&&snapshot.signedIn);
      }
    };
    view();window.renderBusinessWorkspace?.();
  });
})();
