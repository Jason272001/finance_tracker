(function(){
  'use strict';
  const {esc,money,cents,request,mount}=OpsUI,$=id=>document.getElementById(id);
  const local=['localhost','127.0.0.1'].includes(location.hostname),base=local?location.origin:'https://api.keeperbma.com';
  const api=(path,data)=>request(base,path,data===undefined?{}:{method:'POST',body:JSON.stringify(data)});
  let context=null,catalog=[],cart=[],managerUI=null,online=true,lastActor='',busy=false,disposed=false,lastActivity=0,pending=null,extraProduct=null,lastTouch=0,lastSentTouch=0,activityTimer=null,expiring=false,sessionRevision=0;
  const idleSeconds=()=>context?.business?.staff_idle_seconds||2700;
  const pendingKey='keeperbma_pending_cash_sale';
  try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch(_){sessionStorage.removeItem(pendingKey);}
  function say(text,error=false){$('stationStatus').textContent=text;$('stationStatus').classList.toggle('station-error',error);}
  function hide(){for(const id of ['stationOwnerSession','stationPair','stationLogin','stationClock','stationCheckout','stationKitchen','stationManagement'])$(id).hidden=true;}
  function clearManagement(){managerUI?.dispose();managerUI=null;$('stationManagement').replaceChildren();}
  function savePending(value){pending=value;if(value)sessionStorage.setItem(pendingKey,JSON.stringify(value));else sessionStorage.removeItem(pendingKey);}
  function hasOwnerBearer(){return 'keeperbma_token' in localStorage;}
  function ownerSession(){hide();clearManagement();context=null;cart=[];$('stationOwnerSession').hidden=false;$('stationManage').hidden=true;$('stationLogout').hidden=true;$('stationLock').hidden=true;say('Keep the owner’s account signed out on shared staff devices.');}
  function managementActive(){return !!context&&(!!context.management||context.device.mode==='office'&&!!context.staff);}
  function locked(error){clearManagement();hide();cart=[];if(context){context.staff=null;context.management=null;render();}say(error?.message||'Sign in again to continue.',true);}
  async function refresh(){
    if(disposed||expiring)return;
    if(hasOwnerBearer()){ownerSession();return;}
    const revision=sessionRevision;
    try{const next=await api('/operations/device');if(expiring||revision!==sessionRevision)return;online=true;const changed=!context||JSON.stringify([context.device.id,context.staff?.id,context.management?.permissions,context.staff?.permissions,context.business.tax_bps,context.business.industry])!==JSON.stringify([next.device.id,next.staff?.id,next.management?.permissions,next.staff?.permissions,next.business.tax_bps,next.business.industry]);if(changed&&context&&JSON.stringify([context.management?.permissions,context.staff?.permissions])!==JSON.stringify([next.management?.permissions,next.staff?.permissions]))clearManagement();if(context&&context.business.industry!==next.business.industry&&!pending){cart=[];catalog=[];$('stationExtras').close();}context=next;if(changed){lastTouch=Date.now()-Math.max(0,idleSeconds()-(Math.min(context.staff?.idle_until||context.server_time,context.staff?.expires||context.server_time)-context.server_time))*1000;lastSentTouch=lastTouch;render();}else if(context.device.mode==='cashier'&&context.staff)$('stationPay').disabled=busy||(!cart.length&&!pending)||!!pending&&pending.staff!==context.staff.id||cart.some(l=>l.unavailable);}
    catch(e){online=false;if(e.status===409){ownerSession();return;}if(e.status===401){context=null;hide();clearManagement();$('stationPair').hidden=false;say('Enter the one-time code from your business owner.');return;}if([402,403].includes(e.status)){context=null;hide();clearManagement();say(e.message,true);return;}if(context){say(e.message,true);if(context.device.mode==='cashier')renderCart();}else{hide();$('stationPair').hidden=false;say(e.message,true);}}
  }
  function render(){
    if(!context)return;
    const actor=context.staff?.id||'';
    if(actor!==lastActor){cart=[];catalog=[];lastActor=actor;$('stationExtras').close();$('stationReceipt').close();$('stationReceiptBody').replaceChildren();}
    $('stationTitle').textContent=context.device.name;
    $('stationIdentity').textContent=context.business.name+' · '+context.branch+' · '+context.device.mode;
    $('stationManage').hidden=managementActive();$('stationLogout').hidden=!context.staff||managementActive();$('stationLock').hidden=!managementActive();
    hide();
    if(managementActive()){
      $('stationManagement').hidden=false;
      if(!managerUI){
        managerUI=mount($('stationManagement'),{load:day=>api('/operations/admin'+(day?'?date='+encodeURIComponent(day):'')),act:(action,values)=>api('/operations/admin',{action,values})});
        if(pending){const panel=document.createElement('aside');panel.className='station-card';const text=document.createElement('p');text.textContent='This register has an unconfirmed cash sale. Check whether it was recorded, or cancel its reference before restarting checkout.';const button=document.createElement('button');button.type='button';button.textContent='Resolve pending checkout';button.onclick=async()=>{if(!confirm('Resolve this sale reference? If no sale was recorded, its reference will be canceled. Recount physical cash before starting another sale.'))return;button.disabled=true;try{const result=await api('/operations/admin',{action:'cancel_checkout',values:{request_id:pending.body.request_id}});savePending(null);cart=[];panel.remove();if(result.recorded)showReceipt(result.order);say(result.recorded?'The sale was already recorded.':'Unconfirmed checkout canceled. Recount cash before starting a new sale.');}catch(e){say(e.message,true);button.disabled=false;}};panel.append(text,button);$('stationManagement').append(panel);}
      }
      return;
    }
    clearManagement();
    if(context.device.mode==='clock'){$('stationClock').hidden=false;return;}
    if(!context.staff){$('stationLogin').hidden=false;$('stationRoleHint').textContent=context.device.mode==='office'?'Sign in with a role that has back-office access.':'Use your own staff ID and PIN. Sign out before another person takes over.';return;}
    if(context.device.mode==='cashier'){
      $('stationCheckout').hidden=false;const industry=context.business.industry;$('stationIndustry').value=industry;$('stationIndustry').disabled=true;$('stationIndustryLabel').hidden=true;$('stationBusinessType').textContent=industry==='restaurant'?'Restaurant checkout':industry==='retail'?'Retail checkout':'Choose a business type in Store settings';$('stationFulfillmentLabel').hidden=industry!=='restaurant';$('stationCashier').textContent='Cashier: '+context.staff.name+' · ID '+context.staff.code;
      if(!catalog.length)loadCatalog();else renderCatalog();renderCart();
    }else if(context.device.mode==='kitchen'){$('stationKitchen').hidden=false;loadKitchen();}
  }
  async function loadCatalog(){try{const next=(await api('/operations/catalog')).items;let changed=false;if(!pending)for(const line of cart){const product=next.find(p=>p.id===line.id);const selections=(line.modifiers||[]).map(id=>product?.extras?.find(e=>e.id===id));const changes=(line.ingredients||[]).map(choice=>({choice:choice.choice,ingredient:product?.ingredients?.find(i=>i.id===choice.id)}));const price=product?product.price_cents+selections.reduce((n,e)=>n+(e?.price_cents||0),0)+changes.reduce((sum,c)=>sum+(c.choice==='extra'?(c.ingredient?.extra_price_cents||0):0),0):line.price_cents;const unavailable=!product||selections.some(e=>!e)||changes.some(c=>!c.ingredient);if(price!==line.price_cents||line.unavailable!==unavailable)changed=true;line.price_cents=price;line.unavailable=unavailable;}catalog=next;online=true;renderCatalog();if(changed||!cart.length)renderCart();}catch(e){if([401,402,403].includes(e.status))locked(e);else{online=false;say(e.message,true);renderCart();}}}
  function renderCatalog(){
    const query=$('stationSearch').value.trim().toLowerCase();
    $('stationProducts').innerHTML=catalog.filter(p=>(p.name+' '+p.category+' '+p.sku).toLowerCase().includes(query)).map(p=>'<button type="button" class="station-product" data-station-product="'+esc(p.id)+'" '+(p.stock<1?'disabled':'')+'><span class="station-product-icon" aria-hidden="true">'+esc(p.name.slice(0,1).toUpperCase())+'</span><strong>'+esc(p.name)+'</strong><span>'+money(p.price_cents)+'</span><small>'+esc(p.category)+' · '+p.stock+' in stock</small></button>').join('')||'<p>No products. Ask a manager to add products for this branch.</p>';
  }
  function total(){const subtotal=cart.reduce((sum,l)=>sum+l.quantity*l.price_cents,0);return subtotal+Math.floor((subtotal*context.business.tax_bps+5000)/10000);}
  function renderCart(){
    $('stationCart').innerHTML=cart.length?cart.map((l,i)=>'<div class="station-cart-row"><div><strong>'+esc(l.name)+'</strong>'+(l.extra_names?.length?'<p>'+esc(l.extra_names.join(', '))+'</p>':'')+'<p>'+l.quantity+' × '+money(l.price_cents)+'</p><label>Item notes<input data-station-note="'+i+'" maxlength="200" value="'+esc(l.note||'')+'" '+(pending?'disabled':'')+'></label></div><button type="button" data-station-remove="'+i+'" '+(pending?'disabled':'')+'>Remove</button></div>').join(''):'<p>Add products to begin.</p>';
    $('stationTotal').textContent='Total '+money(context?total():0)+' · includes configured tax';
    $('stationPay').disabled=busy||!online||(!cart.length&&!pending)||!!pending&&pending.staff!==context.staff?.id||cart.some(l=>l.unavailable);
    $('stationPay').textContent=pending?'Retry pending cash sale':'Record cash sale';
    $('stationPayForm').elements.received.required=!pending;
    $('stationPayForm').elements.received.disabled=!!pending;
    if(pending)$('stationPayForm').elements.received.value=(pending.body.received_cents/100).toFixed(2);
    $('stationClear').disabled=!!pending;$('stationReconcile').hidden=!pending;
    if(pending&&pending.staff!==context.staff?.id){$('stationPay').disabled=true;say('A previous cashier has an unconfirmed sale. Ask a manager to check it before continuing.',true);}
  }
  function addProduct(id,modifiers=null,ingredients=[],itemNote=''){if(pending)throw Error('Resolve the pending sale before adding products.');if(cart.length>=100)throw Error('A sale supports at most 100 lines.');const p=catalog.find(p=>p.id===id);if(!p)throw Error('This product is unavailable.');const count=cart.filter(l=>l.id===id).reduce((n,l)=>n+l.quantity,0);if(count>=p.stock)throw Error('No more stock is available.');if(modifiers===null&&context.business.industry==='restaurant'){extraProduct=id;$('stationExtrasForm').reset();$('stationExtrasProduct').textContent=p.name;$('stationExtrasIngredients').innerHTML=(p.ingredients||[]).map(i=>'<label>'+esc(i.name)+'<select name="ingredient-'+esc(i.id)+'"><option value="standard">Regular</option><option value="none">No '+esc(i.name)+'</option><option value="extra">Extra '+esc(i.name)+' · '+money(i.extra_price_cents)+'</option></select></label>').join('');$('stationExtrasOptions').innerHTML=(p.extras||[]).map(e=>'<label class="ops-check"><input type="checkbox" name="extra" value="'+esc(e.id)+'">'+esc(e.name)+' · '+money(e.price_cents)+'</label>').join('');$('stationExtras').showModal();return;}const selected=(modifiers||[]).map(id=>p.extras.find(e=>e.id===id));const changes=ingredients.map(choice=>{const i=p.ingredients.find(i=>i.id===choice.id);return {name:(choice.choice==='none'?'No ':'Extra ')+i.name,price_cents:choice.choice==='extra'?i.extra_price_cents:0};});cart.push({id:p.id,name:p.name,price_cents:p.price_cents+[...selected,...changes].reduce((n,e)=>n+e.price_cents,0),quantity:1,note:itemNote,modifiers:modifiers||[],ingredients,extra_names:[...selected,...changes].map(e=>e.name),unavailable:false});renderCart();}

  function showReceipt(order){
    $('stationReceiptBody').innerHTML='<p>'+esc(order.id)+' · '+esc(new Date(order.created*1000).toLocaleString())+'</p><p>Cashier: '+esc(order.cashier_name)+'</p><ul>'+order.items.map(l=>'<li>'+l.quantity+' × '+esc(l.name)+' · '+money(l.price_cents*l.quantity)+(l.note?'<br>'+esc(l.note):'')+'</li>').join('')+'</ul><p>Subtotal '+money(order.subtotal)+' · Tax '+money(order.tax)+'</p><p class="station-total">Total '+money(order.total)+'</p><p>Cash received '+money(order.received)+' · Change '+money(order.received-order.total)+'</p><p>'+esc(order.fulfillment)+(order.kind==='restaurant'?' · Kitchen ticket '+esc(order.ticket):'')+'</p>';
    $('stationReceipt').showModal();
  }
  async function reconcile(){
    if(!pending||!context?.staff)return;
    try{const result=await api('/operations/orders/status/'+encodeURIComponent(pending.body.request_id));savePending(null);cart=[];showReceipt(result);say('The previous cash sale is confirmed.');await loadCatalog();}
    catch(e){if(e.status===404){if(pending.staff===context.staff.id)say('No completed sale was found. Retry the same cash sale; do not collect cash again.');else say('Ask the original cashier to sign in and resolve this pending sale.',true);}else if([401,402].includes(e.status))locked(e);else say(e.message,true);}
  }
  async function loadKitchen(){
    if(!context?.staff||managementActive()||context.device.mode!=='kitchen')return;
    try{
      const {items}=await api('/operations/kitchen');
      if(!context?.staff||managementActive())return;
      const labels={queued:'Start preparing',preparing:'Mark ready',ready:'Mark served'},next={queued:'preparing',preparing:'ready',ready:'served'};
      $('stationTickets').innerHTML=items.map(o=>'<article class="station-ticket" data-state="'+esc(o.ticket)+'"><h3>Ticket '+esc(o.id.slice(0,8))+'</h3><p>'+esc(new Date(o.created*1000).toLocaleTimeString())+' · '+esc(o.fulfillment)+' · '+esc(o.ticket)+'</p><ul>'+o.items.map(l=>'<li><strong>'+l.quantity+' × '+esc(l.name)+'</strong>'+(l.note?'<br>'+esc(l.note):'')+'</li>').join('')+'</ul><p>'+esc(o.note)+'</p><button type="button" data-ticket="'+esc(o.id)+'" data-ticket-state="'+next[o.ticket]+'">'+labels[o.ticket]+'</button></article>').join('')||'<p>No open kitchen tickets.</p>';
      $('stationKitchenSync').textContent='Updated '+new Date().toLocaleTimeString();online=true;
    }catch(e){if([401,402,403].includes(e.status))locked(e);else{$('stationKitchenSync').textContent='Connection lost. Tickets may be out of date.';online=false;}}
  }
  function form(id,fn){$(id).onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.submitter;if(button)button.disabled=true;try{await fn(e);}catch(error){if([401,402].includes(error.status)&&context?.staff)locked(error);else say(error.message,true);}finally{busy=false;if(button?.isConnected)button.disabled=false;if(context?.device.mode==='cashier'&&context.staff)renderCart();}};}
  form('stationPairForm',async()=>{const f=$('stationPairForm'),code=f.elements.code.value;f.reset();await api('/operations/device/pair',{code});say('Device connected.');await refresh();});
  form('stationLoginForm',async()=>{const f=$('stationLoginForm'),data=Object.fromEntries(new FormData(f));f.reset();await api('/operations/staff/login',data);say('Signed in.');await refresh();if(pending&&context?.staff)await reconcile();});
  form('stationClockForm',async e=>{const f=$('stationClockForm'),data=Object.fromEntries(new FormData(f));data.action=e.submitter?.value;f.reset();$('stationClockResult').textContent='';const result=await api('/operations/clock',data);$('stationClockResult').textContent=result.name+' clocked '+result.action+' at '+new Date(result.time*1000).toLocaleTimeString()+'. Ready for the next staff member.';say('');});
  form('stationPayForm',async()=>{
    if(!context?.staff)throw Error('Sign in before checkout.');
    if(pending&&pending.staff!==context.staff.id)throw Error('Only the original cashier can retry this sale.');
    const body=pending?.body||{request_id:crypto.randomUUID(),items:cart.map(l=>({id:l.id,quantity:l.quantity,note:l.note||'',modifiers:l.modifiers||[],ingredients:l.ingredients||[]})),received_cents:cents($('stationPayForm').elements.received.value),expected_total_cents:total(),payment:'cash',kind:$('stationIndustry').value,fulfillment:$('stationFulfillment').value,note:$('stationOrderNote').value};
    if(!pending)savePending({staff:context.staff.id,device:context.device.id,body});
    try{const order=await api('/operations/orders',body);savePending(null);cart=[];$('stationPayForm').reset();$('stationOrderNote').value='';showReceipt(order);say('Cash sale recorded.');await loadCatalog();}
    catch(e){if([400,409,422].includes(e.status)){savePending(null);await refresh();await loadCatalog();}if(!e.status)e.message='Confirmation was interrupted. Check the pending sale or retry with the same reference; do not collect cash again.';throw e;}
  });
  form('stationApprovalForm',async()=>{const f=$('stationApprovalForm'),data=Object.fromEntries(new FormData(f));f.reset();try{await api('/operations/management/unlock',data);$('stationApproval').close();await refresh();}catch(e){$('stationApprovalError').textContent=e.message;throw e;}});
  $('stationExtrasForm').onsubmit=e=>{e.preventDefault();try{const ids=[...e.target.querySelectorAll('[name="extra"]:checked')].map(box=>box.value);const choices=[...e.target.querySelectorAll('[name^="ingredient-"]')].filter(field=>field.value!=='standard').map(field=>({id:field.name.slice(11),choice:field.value}));addProduct(extraProduct,ids,choices,e.target.elements.itemNote.value);$('stationExtras').close();}catch(error){say(error.message,true);}};
  $('stationExtrasCancel').onclick=()=>$('stationExtras').close();
  $('stationScan').onsubmit=e=>{e.preventDefault();try{const f=e.target,p=catalog.find(p=>p.sku===f.elements.sku.value.trim()||p.barcode===f.elements.sku.value.trim());if(!p)throw Error('No product matches this code.');addProduct(p.id);f.reset();}catch(error){say(error.message,true);}};
  $('stationCheckout').addEventListener('click',e=>{const p=e.target.closest('[data-station-product]'),remove=e.target.closest('[data-station-remove]');try{if(p)addProduct(p.dataset.stationProduct);if(remove&&!pending){cart.splice(Number(remove.dataset.stationRemove),1);renderCart();}}catch(error){say(error.message,true);}});
  $('stationCart').oninput=e=>{if(e.target.hasAttribute('data-station-note')&&!pending)cart[Number(e.target.dataset.stationNote)].note=e.target.value;};
  $('stationSearch').oninput=renderCatalog;$('stationIndustry').onchange=()=>{$('stationFulfillmentLabel').hidden=$('stationIndustry').value!=='restaurant';};
  $('stationClear').onclick=()=>{if(!pending){cart=[];renderCart();}};
  $('stationReconcile').onclick=reconcile;
  $('stationManage').onclick=()=>{$('stationClockForm').reset();$('stationLoginForm').reset();$('stationApprovalForm').reset();$('stationApprovalError').textContent='';$('stationApproval').showModal();};
  $('stationApproval').addEventListener('close',()=>$('stationApprovalForm').reset());
  $('stationApprovalCancel').onclick=()=>{$('stationApprovalForm').reset();$('stationApproval').close();};
  $('stationLogout').onclick=async()=>{if(pending&&pending.staff===context?.staff?.id){say('Resolve the pending cash sale before switching staff.',true);return;}try{await api('/operations/staff/logout',{});cart=[];lastActor='';say('Staff signed out.');await refresh();}catch(e){locked(e);}};
  $('stationLock').onclick=async()=>{clearManagement();hide();try{await api(context.device.mode==='office'?'/operations/staff/logout':'/operations/management/lock',{});await refresh();say('Management locked.');}catch(e){locked(e);}};
  $('stationOwnerSignout').onclick=async()=>{try{await request(base,'/auth/logout',{method:'POST',body:'{}'});localStorage.removeItem('keeperbma_token');localStorage.setItem('keeperbma_logout_at',String(Date.now()));await refresh();}catch(e){say(e.message,true);}};
  $('stationFullscreen').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>say('Use your device’s full-screen controls.'));else document.exitFullscreen?.();};
  $('stationReceiptClose').onclick=()=>$('stationReceipt').close();$('stationReceiptPrint').onclick=()=>window.print();
  $('stationManagement').addEventListener('ops-auth-error',e=>locked(e.detail));
  $('stationTickets').addEventListener('click',async e=>{const b=e.target.closest('[data-ticket]');if(!b)return;b.disabled=true;try{await api('/operations/kitchen/'+b.dataset.ticket,{status:b.dataset.ticketState});await loadKitchen();}catch(error){if([401,402,403].includes(error.status))locked(error);else say(error.message,true);}finally{if(b.isConnected)b.disabled=false;}});
  async function sendActivity(){if(!context||(!context.staff&&!context.management)||lastTouch<=lastSentTouch)return;const touch=lastTouch;lastSentTouch=touch;try{await api('/operations/activity',{management:managementActive()});}catch(e){if([401,402,403].includes(e.status))locked(e);}}
  for(const event of ['pointerdown','keydown','input','touchstart'])document.addEventListener(event,()=>{if(!context||(!context.staff&&!context.management))return;lastTouch=Date.now();clearTimeout(activityTimer);activityTimer=setTimeout(sendActivity,500);},{passive:true});
  setInterval(()=>{if(!context?.staff){$('stationIdle').textContent='';return;}const serverRemaining=Math.min(context.staff.idle_until,context.staff.expires)-context.server_time;const localDeadline=(lastTouch||0)+idleSeconds()*1000;const remaining=Math.max(0,Math.ceil(lastTouch?(localDeadline-Date.now())/1000:serverRemaining));$('stationIdle').textContent='Staff sign-out after inactivity: '+Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');if(!remaining&&!expiring){expiring=true;sessionRevision++;clearManagement();context.staff=null;context.management=null;cart=[];render();say('Signed out after 45 minutes without interaction. Enter your ID and PIN again.');api('/operations/staff/logout',{}).catch(()=>{}).finally(()=>{expiring=false;});}},1000);
  setInterval(sendActivity,10000);
  setInterval(()=>{if(document.visibilityState==='visible'&&!busy){refresh();if(context?.staff&&context.device.mode==='cashier'&&!managementActive()&&!pending)loadCatalog();}},5000);
  setInterval(()=>{if(document.visibilityState==='visible'&&!busy)loadKitchen();},2000);
  window.addEventListener('online',refresh);window.addEventListener('offline',()=>{online=false;say('Connection lost. Checkout is paused.',true);if(context?.device.mode==='cashier')renderCart();if(managementActive())locked(Error('Reconnect and sign in again to manage this device.'));});
  window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(activityTimer);clearManagement();});
  refresh();
})();
