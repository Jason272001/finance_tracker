(function(){
  'use strict';
  const $=id=>document.getElementById(id),{request,mount}=OpsUI;
  const local=['localhost','127.0.0.1'].includes(location.hostname),base=local?location.origin:'https://api.keeperbma.com';
  const business=Number(new URLSearchParams(location.search).get('business_id'));
  let user=0,view=null,closed=false,ownerStaff=null;
  const headers=()=>{const token=localStorage.getItem('keeperbma_token');return token?{Authorization:'Bearer '+token}:{};};
  const api=(path,data)=>request(base,path,{headers:headers(),...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
  const path=action=>'/businesses/'+business+'/operations/'+action+'?user_id='+user;
  function say(text,error=false){$('ownerOpsStatus').textContent=text;$('ownerOpsStatus').classList.toggle('station-error',error);}
  function close(message){closed=true;view?.dispose();view=null;$('ownerOpsManagement').hidden=true;$('ownerOpsIdentity').hidden=true;$('ownerOpsCode').textContent='';ownerStaff=null;$('ownerOpsSetup').hidden=true;$('ownerOpsSetupForm').reset();say(message,true);}
  function management(){
    $('ownerOpsSetup').hidden=true;$('ownerOpsManagement').hidden=false;
    view=mount($('ownerOpsManagement'),{load:async day=>{const data=await api(path('admin')+(day?'&date='+encodeURIComponent(day):''));if(!closed){ownerStaff=data.staff.find(person=>person.role==='owner');$('ownerOpsIdentity').hidden=!ownerStaff;$('ownerOpsCode').textContent=ownerStaff?.code||'';$('ownerOpsBusinessName').textContent=data.business.name;}return data;},act:(action,values)=>api(path('admin'),{action,values}),enroll:values=>api(path('enroll'),values),deviceURL:new URL('select-device.html?business_id='+encodeURIComponent(business),location.href).href});
  }
  async function start(){
    if(!Number.isSafeInteger(business)||business<1){close('Choose a business from your signed-in account first.');return;}
    try{
      const profile=await api('/auth/session');user=Number(profile.user_id);
      const result=await api(path('status'));say('Owner access verified.');
      if(result.configured)management();else $('ownerOpsSetup').hidden=false;
    }catch(error){close(error.message);}
  }
  const suggestedID=new Uint32Array(1);crypto.getRandomValues(suggestedID);$('ownerOpsSetupForm').elements.staff_code.value=String(100000+suggestedID[0]%900000);
  $('ownerOpsEditIdentity').onclick=()=>{if(!ownerStaff)return;const root=$('ownerOpsManagement');root.querySelector('[data-ops-tab="staff"]')?.click();root.querySelector('[data-ops-edit-staff="'+ownerStaff.id+'"]')?.click();root.querySelector('#opsStaffEditor')?.scrollIntoView({behavior:'smooth',block:'start'});};
  $('ownerOpsSetupForm').elements.timezone.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Los_Angeles';
  $('ownerOpsSetupForm').onsubmit=async e=>{e.preventDefault();const form=e.target,data=Object.fromEntries(new FormData(form));form.elements.credential.value='';form.elements.confirm.value='';if(data.credential!==data.confirm){say('The PINs do not match.',true);return;}delete data.confirm;e.submitter.disabled=true;try{await api(path('setup'),data);say('Your owner ID is ready. Your PIN is saved securely and will not be displayed. Next, add staff and authorize devices.');management();}catch(error){say(error.message,true);}finally{if(e.submitter.isConnected)e.submitter.disabled=false;}};
  $('ownerOpsManagement').addEventListener('ops-auth-error',e=>close(e.detail.message));
  window.addEventListener('storage',e=>{if(e.key==='keeperbma_logout_at'||e.key==='keeperbma_token'&&!e.newValue)close('Account signed out. Sign in again to manage business devices.');});
  document.addEventListener('visibilitychange',()=>{if(!closed&&document.visibilityState==='visible'&&user)api('/auth/session').catch(e=>close(e.message));});
  start();
})();
