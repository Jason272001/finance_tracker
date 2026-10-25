/* Public, memory-only demo credentials. Never use real IDs or PINs here. */
(function(root){
  'use strict';
  class Access {
    constructor(){this.records=new Map();}
    sync(staff){
      for(const p of staff){
        if(this.records.has(p.id))continue;
        let code=String(10000+p.id);
        while(code==='90000'||[...this.records.values()].some(r=>r.code===code))code=String(Number(code)+1);
        if(!/^\d{5,6}$/.test(code))throw Error('Demo staff ID capacity reached.');
        this.records.set(p.id,{code,pin:'1111'});
      }
    }
    list(staff){this.sync(staff);return staff.map(p=>({...p,staffCode:this.records.get(p.id).code}));}
    authenticate(code,pin,branchId,staff){
      this.sync(staff);code=String(code??'').trim();pin=String(pin??'');
      if(!/^\d{5,6}$/.test(code)||!/^\d{4,6}$/.test(pin))throw Error('Enter a 5–6 digit staff ID and a 4–6 digit demo PIN.');
      if(code==='90000'&&pin==='0000')return {id:'owner',name:'Demo owner',role:'owner',staffCode:code,branchId};
      const person=staff.find(p=>this.records.get(p.id)?.code===code&&this.records.get(p.id)?.pin===pin);
      if(!person)throw Error('Staff ID or PIN is incorrect.');
      if(person.branchId!==branchId)throw Error('This staff member belongs to another branch. Select their branch first.');
      return {...person,staffCode:code,role:'cashier'};
    }
    save(id,code,pin,session,staff){
      if(session?.role!=='owner'||session.locked)throw Error('Sign in as demo owner at POS to manage staff IDs.');
      this.sync(staff);id=Number(id);code=String(code??'').trim();pin=String(pin??'');
      if(!staff.some(p=>p.id===id))throw Error('Choose an existing staff member.');
      if(!/^\d{5,6}$/.test(code)||code==='90000')throw Error('Use a unique 5–6 digit staff ID; 90000 is reserved for the owner.');
      if([...this.records].some(([key,r])=>key!==id&&r.code===code))throw Error('That staff ID is already in use in this business.');
      if(pin&&!/^\d{4,6}$/.test(pin))throw Error('Use a 4–6 digit demo PIN.');
      this.records.set(id,{code,pin:pin||this.records.get(id).pin});
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={Access};else root.DemoStaffAccessModel={Access};
})(typeof window!=='undefined'?window:globalThis);
