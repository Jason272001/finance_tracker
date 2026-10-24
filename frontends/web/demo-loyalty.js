/* Public sample PINs and phone profiles simulate workflows, never authentication/SMS. */
(function(){
  'use strict';
  if(document.documentElement.dataset.demo!=='workspace')return;
  document.addEventListener('DOMContentLoaded',()=>{
    const pos=window.PosDemo,hub=document.getElementById('demoBusinessHub');if(!pos?.signIn||!hub)return;
    const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
    const $=id=>document.getElementById(id);
    const roster=()=>window.BusinessHubDemo.staff();
    const bar=document.createElement('section');bar.className='demo-register';
    bar.innerHTML='<h3>Register sign-in</h3><p>Demo accounts only. Staff PIN <strong>1111</strong> · Owner PIN <strong>0000</strong>. These public PINs simulate switching users; they do not secure an account or clock staff into a shift.</p><form id="registerSignIn" class="pos-fields"><label>Register account<select id="registerAccount"></select></label><label>Demo PIN<input id="registerPin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" required></label><button>Sign in to demo register</button><button type="button" class="secondary" id="registerSignOut">Sign out</button></form><p id="registerStatus" role="status" aria-live="polite"></p>';
    $('posMetrics').before(bar);
    const nav=hub.querySelector('nav[aria-label="Business hub sections"]'),tab=document.createElement('button');tab.type='button';tab.dataset.hubTab='loyalty';tab.textContent='Loyalty & membership';tab.setAttribute('aria-pressed','false');nav.append(tab);
    const panel=document.createElement('section');panel.dataset.hubPanel='loyalty';panel.hidden=true;
    panel.innerHTML=`<h3>Phone membership & loyalty</h3><p>Optional sample membership. No password or email is needed in this demo. Real phone sign-up needs verification and account security before launch. No verification codes or SMS are sent here. Use fictional numbers only.</p><h4>Join using a phone number</h4><form id="memberEnrollment"><div class="pos-fields"><label>Sample phone with country code<input name="phone" type="tel" placeholder="+1 555 010 0200" maxlength="40" required></label><label>Name (optional)<input name="name" maxlength="100"></label></div><label class="customer-consent"><input type="checkbox" name="consent"> This sample member agrees to promotional messages (optional)</label><button>Create / update demo membership</button></form><p id="memberStatus" role="status" aria-live="polite"></p><button type="button" class="secondary" data-design-pos>Return to checkout</button><h4>Owner’s points rules</h4><p id="loyaltyRulesSummary"></p><form id="loyaltyRules" class="pos-fields"><label>Points earned per $1 of eligible spend<input name="earnPerDollar" type="number" min="0" max="1000" step="1" value="1" required></label><label>Points worth $1 at redemption<input name="pointsPerDollar" type="number" min="1" max="100000" step="1" value="100" required></label><button id="saveLoyaltyRules">Save points rules</button></form><p>Only the signed-in demo owner can change rules. Points are earned on whole-dollar-equivalent spend after discounts, before tax; fractions round down per sale. Redemptions use whole $1 increments and cannot stack with another discount. New redemptions use the current conversion rate, including existing points; previous receipts keep their original rules. Voids reverse both earned and spent points.</p><h4>Member account preview</h4><p>Choose a fictional member to preview their account; this selector is not a verified customer login. Jamie starts with 1,000 clearly labeled sample opening points.</p><label>Preview member<select id="loyaltyMember"></select></label><div id="memberOverview" class="pos-metrics"></div><div id="memberPurchases" class="pos-table-wrap"></div><h4>Promotion conversation preview</h4><p>Messages stay in this page only. Outgoing previews require promotional consent. A sample reply of STOP opts the member out. Replies do not earn points.</p><form id="loyaltyMessage" class="pos-fields"><label>Sample promotion message<input name="text" maxlength="500" required placeholder="Write an offer for this member"></label><button>Preview outgoing promotion</button></form><form id="loyaltyReply" class="pos-fields"><label>Sample customer reply<input name="text" maxlength="500" required placeholder="Try STOP to opt out"></label><button>Preview customer reply</button></form><p id="loyaltyMessageStatus" role="status"></p><div id="loyaltyMessages"></div>`;
    hub.append(panel);
    const rewardLabel=document.createElement('label');rewardLabel.innerHTML='Redeem points<input id="posRedeemPoints" type="number" min="0" step="100" value="0">';$('posSavedCustomer').closest('label').after(rewardLabel);
    const rewardInfo=document.createElement('p');rewardInfo.id='posPointsInfo';rewardInfo.className='muted';$('posSaleTotal').before(rewardInfo);
    const join=document.createElement('button');join.type='button';join.className='secondary';join.dataset.hubTab='loyalty';join.textContent='Join phone membership (optional)';$('posCheckout').append(join);
    window.PosLoyalty={options:()=>{
      const id=Number($('posSavedCustomer').value),c=id?window.CustomerDemo.get(id):null;
      return {customerId:id,member:!!c?.member,points:Number($('posRedeemPoints').value||0)};
    }};
    function run(id,action){return e=>{e.preventDefault();try{action(e);if(id!=='registerStatus')$(id).textContent='Sample updated. Nothing was sent or saved outside this demo.';}catch(err){$(id).textContent=err.message;}};}
    function updateRoster(){const old=$('registerAccount').value;$('registerAccount').innerHTML='<option value="owner">Demo owner</option>'+roster().map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');if([...$('registerAccount').options].some(o=>o.value===old))$('registerAccount').value=old;
      const s=pos.session();if(s&&s.role!=='owner'&&!roster().some(r=>r.id===s.id))pos.signOut();
    }
    function member(){const id=Number($('loyaltyMember').value);return id?window.CustomerDemo.get(id):null;}
    function render(){
      const session=pos.session(),rules=pos.snapshot().loyalty;
      $('registerStatus').textContent=session?'Signed in: '+session.name+' · '+session.role+' · sample branch '+session.branchId:'Signed out. Sign in before completing a sale, receiving a purchase or voiding a sale.';
      $('registerSignOut').disabled=!session;
      for(const field of $('loyaltyRules').elements)field.disabled=session?.role!=='owner';
      $('loyaltyRulesSummary').textContent=rules.earnPerDollar+' points earned per $1; '+rules.pointsPerDollar+' points = $1; '+(rules.pointsPerDollar*10)+' points = $10. '+(session?.role==='owner'?'Owner controls unlocked.':'Sign in as demo owner at POS to edit.');
      const data=window.CustomerDemo.snapshot(),old=$('loyaltyMember').value,rows=data.customers.filter(c=>c.member&&!c.archived);
      $('loyaltyMember').innerHTML=rows.map(c=>'<option value="'+c.id+'">'+esc(c.name)+' · '+esc(c.phone)+'</option>').join('');if(rows.some(c=>String(c.id)===old))$('loyaltyMember').value=old;
      const c=member(),sales=c?pos.snapshot().sales.filter(s=>s.customerId===c.id):[];
      const balance=c?pos.points(c.id):0,net=sales.filter(s=>s.status==='completed').reduce((n,s)=>n+s.subtotal-s.discount,0);
      $('memberOverview').innerHTML=[['Points available',balance],['Redeemable value',money(Math.floor(balance/rules.pointsPerDollar)*100)],['Net spend (before tax)',money(net)],['Promotional preference',c?.consent?'Opted in':'Opted out']].map(([k,v])=>'<article><span>'+k+'</span><strong>'+esc(v)+'</strong></article>').join('');
      $('memberPurchases').innerHTML='<table><thead><tr><th>Sale / products</th><th>Cashier</th><th>Total</th><th>Points</th><th>Status</th></tr></thead><tbody>'+(sales.map(s=>'<tr><td>'+esc(s.id)+' · '+esc(new Date(s.date).toLocaleDateString())+'<br>'+esc(s.items.map(i=>i.name+' × '+i.quantity).join(', '))+'</td><td>'+esc(s.cashier?.name||'Legacy sample')+'</td><td>'+money(s.total)+'</td><td>+'+(s.loyalty?.earned||0)+' / −'+(s.loyalty?.redeemed||0)+'</td><td>'+esc(s.status)+'</td></tr>').join('')||'<tr><td colspan="5">No purchases yet.</td></tr>')+'</tbody></table>';
      $('loyaltyMessages').innerHTML=data.messages.filter(m=>m.customerId===c?.id).map(m=>'<p><strong>'+(m.incoming?'Customer reply':'Promotion preview')+':</strong> '+esc(m.text)+'</p>').join('')||'<p>No sample messages.</p>';
      const selected=Number($('posSavedCustomer').value),customer=selected?window.CustomerDemo.get(selected):null;
      $('posRedeemPoints').disabled=!customer?.member;$('posRedeemPoints').step=rules.pointsPerDollar;
      if(!customer?.member)$('posRedeemPoints').value='0';
      $('posPointsInfo').textContent=customer?.member?customer.name+': '+pos.points(selected)+' available points. Redeem in multiples of '+rules.pointsPerDollar+' points = $1.':'Walk-in and non-member checkout earn no points. Joining is optional.';
    }
    $('registerSignIn').onsubmit=run('registerStatus',()=>{const id=$('registerAccount').value,branchId=window.BusinessHubDemo.branch().id;pos.signIn(id==='owner'?{id:'owner',branchId}:roster().find(s=>s.id===Number(id)),$('registerPin').value);$('registerPin').value='';render();});
    $('registerSignOut').onclick=()=>{pos.signOut();render();};
    $('loyaltyRules').onsubmit=run('memberStatus',()=>{pos.setLoyalty(Object.fromEntries(new FormData($('loyaltyRules'))));render();pos.refreshCart();});
    $('memberEnrollment').onsubmit=run('memberStatus',()=>{const id=window.CustomerDemo.enroll(Object.fromEntries(new FormData($('memberEnrollment'))));$('memberEnrollment').reset();render();$('loyaltyMember').value=id;$('posSavedCustomer').value=id;render();pos.refreshCart();});
    $('loyaltyMessage').onsubmit=run('loyaltyMessageStatus',()=>{const c=member();window.CustomerDemo.message(c?.id,$('loyaltyMessage').elements.text.value,false);render();});
    $('loyaltyReply').onsubmit=run('loyaltyMessageStatus',()=>{const c=member();window.CustomerDemo.message(c?.id,$('loyaltyReply').elements.text.value,true);render();});
    $('loyaltyMember').onchange=render;$('posRedeemPoints').oninput=()=>pos.refreshCart();
    document.addEventListener('keeper-customer-selection',()=>{$('posRedeemPoints').value='0';render();pos.refreshCart();});
    document.addEventListener('keeper-pos-change',render);document.addEventListener('keeper-customers-change',render);
    document.addEventListener('keeper-staff-change',updateRoster);
    document.addEventListener('keeper-branch-change',()=>{pos.signOut();updateRoster();render();});
    $('posCheckout').addEventListener('reset',()=>queueMicrotask(()=>{render();pos.refreshCart();}));
    updateRoster();render();pos.refreshCart();
  });
})();
