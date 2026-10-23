(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function timestamp(x){const n=typeof x==='number'?x:new Date(x).getTime();if(!Number.isFinite(n))throw Error('Enter a valid date and time.');return n;}
  class Clock {
    constructor(){this.shifts=[];this.next=0;}
    employee(person){if(!person || !Number.isInteger(person.id) || !person.name || !Number.isInteger(person.rate) || person.rate<0 || person.rate>100000000)throw Error('Choose a staff member with a valid hourly rate.');}
    get(id){const s=this.shifts.find(s=>s.id===Number(id));if(!s)throw Error('Shift not found.');return s;}
    active(person){return this.shifts.find(s=>s.employeeId===person.id&&s.end===null);}
    overlap(employeeId,start,end,ignore=0){return this.shifts.some(s=>s.id!==ignore&&s.employeeId===employeeId&&start<(s.end??Infinity)&&end>s.start);}
    clockIn(person,now=Date.now()){
      this.employee(person);now=timestamp(now);if(this.shifts.length>=500)throw Error('Demo limit: 500 shifts.');
      if(this.active(person)||this.overlap(person.id,now,Infinity))throw Error('This employee already has an active or overlapping shift.');
      const s={id:++this.next,employeeId:person.id,name:person.name,rate:person.rate,start:now,end:null,breaks:[],approved:false,note:'Clock entry'};this.shifts.push(s);return copy(s);
    }
    breakStart(id,now=Date.now()){const s=this.get(id);now=timestamp(now);if(s.end!==null||s.breaks.some(b=>b.end===null)||now<s.start)throw Error('Start a break only during an active shift.');if(s.breaks.length&&now<s.breaks.at(-1).end)throw Error('Breaks must be chronological.');s.breaks.push({start:now,end:null});}
    breakEnd(id,now=Date.now()){const s=this.get(id),b=s.breaks.at(-1);now=timestamp(now);if(s.end!==null||!b||b.end!==null||now<b.start)throw Error('There is no active break to end.');b.end=now;}
    clockOut(id,now=Date.now()){const s=this.get(id);now=timestamp(now);if(s.end!==null||now<=s.start||s.breaks.some(b=>(b.end??b.start)>now))throw Error('Clock-out must follow the shift and breaks.');const b=s.breaks.at(-1);if(b&&b.end===null)b.end=now;s.end=now;}
    manual(person,start,end,breakMinutes=0,note=''){
      this.employee(person);start=timestamp(start);end=timestamp(end);breakMinutes=Number(breakMinutes);
      if(this.shifts.length>=500)throw Error('Demo limit: 500 shifts.');
      if(end<=start||end-start>7*86400000||!Number.isFinite(breakMinutes)||breakMinutes<0||breakMinutes*60000>end-start)throw Error('Use a positive shift up to seven days and a break no longer than the shift.');
      if(this.overlap(person.id,start,end))throw Error('This entry overlaps another shift for this employee.');
      const s={id:++this.next,employeeId:person.id,name:person.name,rate:person.rate,start,end,breaks:breakMinutes?[{start:end-breakMinutes*60000,end}]:[],approved:false,note:String(note).slice(0,300)};this.shifts.push(s);return copy(s);
    }
    approve(id){const s=this.get(id);if(s.end===null)throw Error('Clock out before approving a shift.');s.approved=!s.approved;}
    remove(id){const s=this.get(id);if(s.approved)throw Error('Reopen the shift before deleting it.');if(s.end===null)throw Error('Clock out before deleting an active shift.');this.shifts.splice(this.shifts.indexOf(s),1);}
    snapshot(){return copy(this.shifts);}
    static paid(s,start=-Infinity,end=Infinity){if(s.end===null)return 0;const a=Math.max(s.start,start),z=Math.min(s.end,end);if(z<=a)return 0;return Math.max(0,z-a-s.breaks.reduce((n,b)=>n+Math.max(0,Math.min(b.end??z,z)-Math.max(b.start,a)),0));}
    payroll(start,end,threshold=40,multiplier=1.5){
      start=timestamp(start);end=timestamp(end);threshold=Number(threshold);multiplier=Number(multiplier);
      if(end<=start||!Number.isFinite(threshold)||threshold<0||threshold>168||!Number.isFinite(multiplier)||multiplier<1||multiplier>5)throw Error('Use a valid period, threshold (0–168 hours), and multiplier (1–5).');
      const people=new Map();
      for(const s of this.shifts.filter(s=>s.approved&&s.end!==null).sort((a,b)=>a.start-b.start||a.id-b.id)){
        const ms=Clock.paid(s,start,end);if(!ms)continue;
        const p=people.get(s.employeeId)||{employeeId:s.employeeId,name:s.name,regularMs:0,overtimeMs:0,regularPay:0,overtimePay:0};
        const regular=Math.min(ms,Math.max(0,threshold*3600000-p.regularMs)),overtime=ms-regular;
        p.regularMs+=regular;p.overtimeMs+=overtime;p.regularPay+=regular/3600000*s.rate;p.overtimePay+=overtime/3600000*s.rate*multiplier;people.set(s.employeeId,p);
      }
      return [...people.values()].map(p=>({...p,regularPay:Math.round(p.regularPay),overtimePay:Math.round(p.overtimePay),gross:Math.round(p.regularPay)+Math.round(p.overtimePay)}));
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={Clock};else root.DemoTime={Clock};
})(typeof window!=='undefined'?window:globalThis);
