(function(){
 'use strict';
 const $=id=>document.getElementById(id),local=['localhost','127.0.0.1'].includes(location.hostname),base=local?location.origin:'https://api.keeperbma.com';
 const business=Number(new URLSearchParams(location.search).get('business_id'));
 const labels={cashier:'Cashier register',office:'Office',clock:'Time clock',kitchen:'Kitchen display'};
 const requested=new URLSearchParams(location.search).get('mode'),mode=['cashier','kitchen','clock','office'].includes(requested)?requested:null;
 let devices=[],selected=null,owner=false,busy=false;
 const headers=()=>{const token=localStorage.getItem('keeperbma_token');return token?{Authorization:'Bearer '+token}:{};};
 const api=(path,body)=>OpsUI.request(base,path,{headers:headers(),...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 function say(text,error=false){$('selectStatus').textContent=text;$('selectStatus').classList.toggle('station-error',error);}
 function pending(){try{return JSON.parse(sessionStorage.getItem('keeperbma_pending_cash_sale')||'null');}catch(_){return null;}}
 function step(number){document.querySelectorAll('.select-device-steps li').forEach((item,index)=>{if(index===number-1)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});}
 function sync(){ $('selectContinue').disabled=busy||!selected;$('selectContinue').textContent=selected?'Continue with '+selected.name:'Choose a device to continue';}
 function cancel(){step(1);selected=null;$('selectDevice').value='';$('selectDetails').textContent='';$('selectPairForm').reset();$('selectPair').hidden=true;$('selectOwner').hidden=true;$('selectDeviceForm').hidden=!devices.length;$('selectOther').hidden=false;say('Choose a device. Nothing is selected automatically.');sync();$('selectDevice').focus();}
 function showPair(){ step(2);$('selectOwner').hidden=true;$('selectPair').hidden=false;$('selectPairTitle').textContent=selected?'Connect '+selected.name:'Connect a device with its code';$('selectPairForm').reset();$('selectPairForm').elements.code.focus();say('Enter the code for '+(selected?.name||'the device you want to connect')+'.');}
 async function continueSelection(){
  if(pending()){$('selectResume').hidden=false;say('This browser has an unconfirmed cash sale. Return to its current station and ask a manager to resolve it before selecting a device.',true);return;}
  if(owner){$('selectDeviceForm').hidden=true;$('selectOther').hidden=true;$('selectOwnerTarget').textContent=selected?'Selected device: '+selected.name:'Connect a different device';$('selectOwner').hidden=false;step(2);$('selectOwnerSignout').focus();return;}
  if(selected?.current){await api('/operations/staff/logout',{});location.assign('./business-device.html?selected=1');return;}
  $('selectDeviceForm').hidden=true;$('selectOther').hidden=true;showPair();
 }
 async function run(fn){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;try{await fn();}catch(e){say(e.message,true);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;sync();const target=!$('selectOwner').hidden?$('selectOwnerSignout'):!$('selectPair').hidden?$('selectPairForm').elements.code:null;target?.focus();}}
 $('selectDevice').onchange=()=>{selected=devices.find(d=>d.id===$('selectDevice').value)||null;$('selectDetails').textContent=selected?[selected.branch,labels[selected.mode]||selected.mode,selected.current?'Saved connection - staff sign-in required':'Device code required'].filter(Boolean).join(' · '):'';sync();};
 $('selectDeviceForm').onsubmit=e=>{e.preventDefault();run(async()=>{if(!selected)throw Error('Choose a device first.');await continueSelection();});};
 $('selectOther').onclick=()=>run(async()=>{selected=null;await continueSelection();});
 $('selectCancel').onclick=cancel;$('selectOwnerCancel').onclick=cancel;
 $('selectOwnerSignout').onclick=()=>run(async()=>{await api('/auth/logout',{});localStorage.removeItem('keeperbma_token');localStorage.setItem('keeperbma_logout_at',String(Date.now()));owner=false;showPair();});
 $('selectPairForm').onsubmit=e=>{e.preventDefault();run(async()=>{const code=e.target.elements.code.value;e.target.reset();await api('/operations/device/pair',{code,...(selected?{device_id:selected.id}:{}),...(mode?{mode}:{})});location.assign('./business-device.html?selected=1');});};
 async function start(){
  try{
   let result;
   if(Number.isSafeInteger(business)&&business>0){try{const profile=await api('/auth/session');result=await api('/businesses/'+business+'/operations/device-options?user_id='+encodeURIComponent(profile.user_id));owner=true;}catch(e){if(![401,403,404].includes(e.status))throw e;}}
   if(!result){try{result=await api('/operations/device/options');}catch(e){if(e.status===409||localStorage.getItem('keeperbma_token'))owner=true;else if(![401,403].includes(e.status))throw e;}}
   devices=(result?.items||[]).filter(d=>!mode||d.mode===mode);
   for(const d of devices){const option=document.createElement('option');option.value=d.id;option.textContent=d.name+' · '+d.branch+' · '+(labels[d.mode]||d.mode);$('selectDevice').append(option);}
   if(mode){document.querySelector('h1').textContent=mode==='cashier'?'Sales checkout - select cashier':'Select '+labels[mode];$('selectEmpty').textContent='No '+labels[mode].toLowerCase()+' devices are available in this browser. Ask the owner to add one in Devices, or connect one using its private code.';}
   $('selectDevice').value='';$('selectDeviceForm').hidden=!devices.length;$('selectEmpty').hidden=!!devices.length;say(devices.length?'Choose a device. Nothing is selected automatically.':'Choose “Connect a device with a code” to get started.');
  }catch(e){say(e.message,true);$('selectEmpty').hidden=false;}finally{$('selectOther').disabled=false;sync();}
 }
 start();
})();
