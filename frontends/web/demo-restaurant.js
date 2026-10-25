(function(){
  'use strict';
  if(document.documentElement.dataset.demo!=='workspace')return;
  const assets=new URL('../../assets/menu/',document.currentScript.src);
  document.addEventListener('DOMContentLoaded',()=>{
    const pos=window.PosDemo,host=document.querySelector('[data-pos-panel="checkout"]');if(!pos?.addLines||!host)return;
    let mode='retail',customer=false,sequence=0,key='burger';
    const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
    const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const controls=document.createElement('div');controls.className='pos-workflow';
    controls.innerHTML='<div class="pos-mode-switch" role="group" aria-label="POS industry"><button type="button" data-industry="retail" aria-pressed="true">Retail</button><button type="button" data-industry="restaurant" aria-pressed="false">Restaurant</button></div><p id="posWorkflowNote">Scan a product code or choose a product below.</p><form id="posScanForm" class="pos-fields"><label>Barcode / QR product code<input id="posScanCode" maxlength="60" autocomplete="off" placeholder="Scan or type a product SKU"></label><button>Add scanned product</button></form><p class="muted" id="posScanHelp">Use a USB/Bluetooth scanner in keyboard mode and press Enter. QR codes must contain the exact product SKU; camera scanning is not connected.</p><div id="restaurantMenu" hidden><div class="pos-fields"><label>Order type<select id="restaurantFulfillment"><option value="takeaway">Takeaway</option><option value="dine-in">Dine-in</option></select></label><button type="button" id="customerMenuToggle" class="secondary">Customer menu preview</button></div><p id="customerMenuNote" class="muted">Tap a picture to customize. Sample menu and prices only.</p><div id="restaurantTiles" class="restaurant-tiles"></div></div><p id="restaurantStatus" role="status" aria-live="polite"></p>';
    host.querySelector('h3').after(controls);
    const dialog=document.createElement('dialog');dialog.className='restaurant-dialog';dialog.setAttribute('aria-labelledby','restaurantItemTitle');
    dialog.innerHTML='<form id="restaurantItemForm"><h3 id="restaurantItemTitle"></h3><label>Quantity<input name="quantity" type="number" min="1" max="100" value="1" required></label><div id="burgerOptions"><label class="restaurant-check"><input name="meal" type="checkbox"> Make it a combo · fries + drink, $2 bundle discount</label><label class="restaurant-check"><input name="patty" type="checkbox"> Extra patty · $2 each</label><label class="restaurant-check"><input name="sauce" type="checkbox"> Extra sauce · $0.50 each</label></div><label id="restaurantDrinkLabel">Drink<select name="drink"><option>Cola</option><option>Lemonade</option><option>Water</option></select></label><label>Order notes<textarea name="note" maxlength="200" placeholder="Example: no onions"></textarea></label><p id="restaurantItemPrice" class="pos-total"></p><p id="restaurantItemError" role="alert"></p><div class="kiosk-actions"><button>Add to order</button><button type="button" id="restaurantCancel" class="secondary">Cancel</button></div></form>';
    document.body.append(dialog);
    const $=id=>document.getElementById(id),form=$('restaurantItemForm');
    function values(){return {quantity:form.elements.quantity.value,meal:form.elements.meal.checked,patty:form.elements.patty.checked,sauce:form.elements.sauce.checked,drink:form.elements.drink.value,note:form.elements.note.value};}
    function preview(){try{const order=DemoRestaurantModel.order(key,values(),pos.snapshot().products,'preview');$('restaurantItemPrice').textContent=money(order.total);$('restaurantItemError').textContent='';}catch(e){$('restaurantItemError').textContent=e.message;}}
    function tiles(){
      $('restaurantTiles').innerHTML=DemoRestaurantModel.catalog.slice(0,4).map(item=>{const p=pos.snapshot().products.find(p=>p.sku===item.sku);return '<button type="button" class="restaurant-tile" data-menu-item="'+item.key+'"><img src="'+esc(p?.image||new URL(item.picture+'.svg',assets).href)+'" alt=""><strong>'+esc(p?.name||item.name)+'</strong><span>'+money(p?.price??item.price)+'</span></button>';}).join('');
    }
    function view(){
      controls.querySelectorAll('[data-industry]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.industry===mode)));
      $('restaurantMenu').hidden=mode!=='restaurant';$('posScanForm').hidden=customer;$('posScanHelp').hidden=customer;
      $('posSaleLine').hidden=mode==='restaurant';$('posCheckout').hidden=customer;
      document.querySelector('.demo-register').hidden=customer;
      $('customerMenuToggle').textContent=customer?'Return to staff checkout':'Customer menu preview';
      $('customerMenuNote').textContent=customer?'Build a sample order, then hand this screen to staff for checkout. This preview does not submit orders to a kitchen or another device.':'Tap a picture to customize. Sample menu and prices only.';
      $('posWorkflowNote').textContent=mode==='restaurant'?'Touch menu · combos, extras and order notes.':'Scan a product code or choose a product below.';
    }
    controls.addEventListener('click',e=>{
      const industry=e.target.closest('[data-industry]');
      try{
        if(industry){customer=false;if(industry.dataset.industry==='restaurant')pos.seedMenu();mode=industry.dataset.industry;tiles();view();}
        const tile=e.target.closest('[data-menu-item]');if(!tile)return;
        key=tile.dataset.menuItem;form.reset();$('restaurantItemTitle').textContent=DemoRestaurantModel.catalog.find(p=>p.key===key).name;
        $('burgerOptions').hidden=!['burger','double'].includes(key);$('restaurantDrinkLabel').hidden=key==='fries';preview();dialog.showModal();
      }catch(error){$('restaurantStatus').textContent=error.message;}
    });
    $('customerMenuToggle').onclick=()=>{customer=!customer;view();};
    $('restaurantCancel').onclick=()=>dialog.close();form.oninput=preview;
    form.onsubmit=e=>{e.preventDefault();try{const result=DemoRestaurantModel.order(key,values(),pos.snapshot().products,'meal-'+(++sequence));pos.addLines(result.lines);dialog.close();$('restaurantStatus').textContent='Added to sample order · '+money(result.total);}catch(error){$('restaurantItemError').textContent=error.message;}};
    $('posScanForm').onsubmit=e=>{e.preventDefault();try{const code=$('posScanCode').value.trim(),p=pos.snapshot().products.find(p=>p.sku===code);if(!p)throw Error('No product matches this code. Use a product SKU from the catalog.');pos.addLines([{productId:p.id,quantity:1,unitPrice:p.price/100}]);$('posScanCode').value='';$('restaurantStatus').textContent=p.name+' added to sample cart.';}catch(error){$('restaurantStatus').textContent=error.message;}};
    window.RestaurantDemo={mode:()=>mode};
    document.addEventListener('keeper-pos-change',()=>{if(mode==='restaurant')tiles();});
  });
})();
