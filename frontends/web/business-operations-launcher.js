/* Show real device tools only when the deployed server supports them. */
(function(){
  'use strict';if(document.documentElement.dataset.demo)return;
  document.addEventListener('DOMContentLoaded',()=>{
    const workspace=document.getElementById('businessWorkspace'),roster=document.getElementById('liveStaffRecords');if(!workspace||!roster)return;
    const nav=workspace.querySelector('nav[aria-label="Business workspace"]'),link=document.createElement('a');link.className='live-ops-link';link.textContent='Devices & staff access';link.hidden=true;nav.append(link);
    const entry=document.createElement('section');entry.className='card';entry.hidden=true;entry.innerHTML='<h2>Staff IDs & business devices</h2><p>Manage staff credentials, authorize cashier registers and kitchen displays, and set up the time-clock kiosk.</p><a class="live-ops-open">Open staff & device controls →</a>';roster.append(entry);
    const legacy=[...roster.children].filter(n=>n!==entry),cache=new Map();let available=false,latest=null;
    function update(){
      const s=latest,enabled=!!(available&&s?.signedIn&&s?.business?.is_owner&&s.access);link.hidden=!enabled;entry.hidden=!enabled;legacy.forEach(n=>n.hidden=enabled);
      if(!enabled)return;
      const key=s.userId+':'+s.business.business_id,url='./operations-admin.html?business_id='+encodeURIComponent(s.business.business_id);link.href=url;entry.querySelector('a').href=url;
      const metric=workspace.querySelector('#liveBusinessMetrics article:nth-child(2)');if(metric){metric.querySelector('span').textContent='Active staff IDs';metric.querySelector('strong').textContent=cache.get(key)?.staff_count??'—';}
      if(!cache.has(key)){cache.set(key,null);window.api('/businesses/'+s.business.business_id+'/operations/status?user_id='+s.userId).then(data=>{cache.set(key,data);if(latest?.business?.business_id===s.business.business_id)update();}).catch(()=>{entry.querySelector('p').textContent='Open the owner controls to check device setup and staff access.';});}
    }
    window.addEventListener('keeper-business-context',e=>{latest=e.detail;update();});
    fetch('https://api.keeperbma.com/operations/capabilities',{credentials:'omit',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{available=data?.available===true;update();}).catch(()=>{});
    window.renderBusinessWorkspace?.();
  });
})();
