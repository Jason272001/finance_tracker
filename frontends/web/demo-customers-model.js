/* Temporary customer relationships. No storage, messaging or account access. */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const clean=(x,n)=>String(x??'').trim().slice(0,n);
  function localDay(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function validDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;}
  const sources=['WhatsApp','Referral','Google Play','Instagram','Walk-in','Other'];
  class Customers {
    constructor(){this.next=10;this.customers=[{id:1,name:'Jamie Sample',email:'jamie@example.test',phone:'',source:'Referral',notes:'Fictional customer. Interested in the weekend offer.',consent:false,archived:false}];this.followups=[{id:2,customerId:1,date:localDay(),task:'Review interest in the weekend offer',done:false}];}
    snapshot(){return copy({customers:this.customers,followups:this.followups});}
    get(id){const c=this.customers.find(c=>c.id===Number(id));if(!c)throw Error('Choose an existing sample customer.');return copy(c);}
    save(v,id=0){
      const name=clean(v.name,100),email=clean(v.email,150).toLowerCase(),phone=clean(v.phone,40),notes=clean(v.notes,1000),source=clean(v.source,30);
      if(!name)throw Error('A customer name is required.');
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid sample email address.');
      if(phone&&!/^[+\d().\s-]{6,40}$/.test(phone))throw Error('Enter a sample phone number using digits and normal phone punctuation.');
      if(!sources.includes(source))throw Error('Choose a customer source.');
      if(email&&this.customers.some(c=>c.id!==Number(id)&&c.email===email))throw Error('That email already belongs to a sample customer.');
      const values={name,email,phone,notes,source,consent:v.consent===true||v.consent==='on'};
      if(id){this.get(id);Object.assign(this.customers.find(c=>c.id===Number(id)),values);return Number(id);}
      if(this.customers.length>=100)throw Error('Demo limit: 100 customers.');
      const key=++this.next;this.customers.push({id:key,...values,archived:false});return key;
    }
    archive(id){this.get(id);const c=this.customers.find(c=>c.id===Number(id));c.archived=!c.archived;}
    followup(v){const c=this.get(v.customerId),date=clean(v.date,10),task=clean(v.task,200);if(c.archived)throw Error('Restore the customer before adding a follow-up.');if(!validDay(date)||!task)throw Error('Enter a valid follow-up date and task.');if(this.followups.length>=300)throw Error('Demo limit: 300 follow-ups.');this.followups.push({id:++this.next,customerId:c.id,date,task,done:false});}
    toggle(id){const f=this.followups.find(f=>f.id===Number(id));if(!f)throw Error('Choose an existing follow-up.');f.done=!f.done;}
    summary(id,sales=[]){this.get(id);const completed=sales.filter(s=>s.customerId===Number(id)&&s.status==='completed');return {orders:completed.length,netSales:completed.reduce((n,s)=>n+s.subtotal-s.discount,0)};}
  }
  const api={Customers,localDay,sources};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DemoCustomersModel=api;
})(typeof window!=='undefined'?window:globalThis);
