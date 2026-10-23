(function(root){
  'use strict';
  class Schedule {
    constructor(){this.entries=[];this.next=0;}
    assign(people,start,end,breakMinutes=0,note=''){
      start=Number(start);end=Number(end);breakMinutes=Number(breakMinutes);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000)throw Error('Choose a shift longer than zero and up to 24 hours.');
      if(!Number.isFinite(breakMinutes)||breakMinutes<0||!Number.isInteger(breakMinutes)||breakMinutes*60000>=end-start)throw Error('Unpaid break must be whole minutes and shorter than the shift.');
      if(!Array.isArray(people)||!people.length)throw Error('Select at least one employee.');
      if(this.entries.length+people.length>500)throw Error('Demo limit: 500 assignments.');
      const ids=new Set();
      for(const p of people){if(!p||!Number.isInteger(p.id)||!p.name||ids.has(p.id))throw Error('Select valid, distinct staff members.');ids.add(p.id);if(this.entries.some(s=>s.employeeId===p.id&&s.start<end&&s.end>start))throw Error(`${p.name} already has an overlapping scheduled shift. No assignments were added.`);}
      for(const p of people)this.entries.push({id:++this.next,employeeId:p.id,name:String(p.name),start,end,breakMinutes,note:String(note).slice(0,300)});
    }
    cancel(id){const i=this.entries.findIndex(s=>s.id===Number(id));if(i<0)throw Error('Assignment not found.');this.entries.splice(i,1);}
    snapshot(){return JSON.parse(JSON.stringify(this.entries));}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={Schedule};else root.DemoSchedule={Schedule};
})(typeof window!=='undefined'?window:globalThis);
