(function(root){
  'use strict';
  const catalog=[
    {key:'burger',sku:'KITCHEN-BURGER',name:'Cheeseburger',price:650,cost:350,stock:50,picture:'burger'},
    {key:'double',sku:'KITCHEN-DOUBLE',name:'Double cheeseburger',price:850,cost:450,stock:50,picture:'burger'},
    {key:'fries',sku:'KITCHEN-FRIES',name:'Medium fries',price:250,cost:100,stock:100,picture:'fries'},
    {key:'drink',sku:'KITCHEN-DRINK',name:'Fountain drink',price:200,cost:80,stock:100,picture:'drink'},
    {key:'patty',sku:'KITCHEN-PATTY',name:'Extra patty',price:200,cost:150,stock:50,picture:'burger'},
    {key:'sauce',sku:'KITCHEN-SAUCE',name:'Extra sauce',price:50,cost:20,stock:100,picture:'fries'},
  ];
  function order(key,values,products,groupId){
    const definition=catalog.find(p=>p.key===key);if(!definition)throw Error('Choose a menu item.');
    const quantity=Number(values.quantity),burger=['burger','double'].includes(key);
    if(!Number.isInteger(quantity)||quantity<1||quantity>100)throw Error('Use 1–100 menu items per order.');
    if(!String(groupId||'').trim())throw Error('An order group is required.');
    const get=k=>{const d=catalog.find(p=>p.key===k),p=products.find(p=>p.sku===d.sku);if(!p)throw Error('A menu product is missing. Restore the menu catalog first.');return p;};
    const meal=burger&&values.meal,drink=String(values.drink||'Cola');
    if((meal||key==='drink')&&!['Cola','Lemonade','Water'].includes(drink))throw Error('Choose a sample drink.');
    const note=String(values.note||'').trim().slice(0,200),lines=[];
    const add=(k,price,note)=>{const p=get(k);lines.push({productId:p.id,quantity,unitPrice:(price??p.price)/100,note,groupId:String(groupId)});};
    const main=get(key);
    add(key,main.price-(meal?Math.min(200,main.price):0),[meal?'Combo':'',key==='drink'?drink:'',note].filter(Boolean).join(' · '));
    if(meal){add('fries',null,'Combo side');add('drink',null,drink+' · Combo drink');}
    if(burger&&values.patty)add('patty',null,'Burger extra');
    if(burger&&values.sauce)add('sauce',null,'Burger extra');
    return {lines,total:lines.reduce((n,l)=>n+Math.round(l.unitPrice*100)*l.quantity,0)};
  }
  const api={catalog,order};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DemoRestaurantModel=api;
})(typeof window!=='undefined'?window:globalThis);
