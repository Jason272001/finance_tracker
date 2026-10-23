(function(root){
  'use strict';
  class Branches {
    constructor(){this.rows=[{id:1,name:'Main Street',address:'10 Sample Street'},{id:2,name:'Riverside',address:'20 Sample Avenue'}];this.selected=1;this.next=2;}
    snapshot(){return this.rows.map(b=>({...b}));}
    current(){return {...this.rows.find(b=>b.id===this.selected)};}
    select(id){if(!this.rows.some(b=>b.id===Number(id)))throw Error('Choose an existing branch.');this.selected=Number(id);}
    save(name,address='',id=0){name=String(name).trim();address=String(address).trim();id=Number(id);if(!name||name.length>80||address.length>200)throw Error('Use a branch name up to 80 characters and an address up to 200 characters.');if(this.rows.some(b=>b.id!==id&&b.name.toLowerCase()===name.toLowerCase()))throw Error('A branch with this name already exists.');if(id){const b=this.rows.find(b=>b.id===id);if(!b)throw Error('Branch not found.');Object.assign(b,{name,address});return id;}if(this.rows.length>=20)throw Error('Demo limit: 20 branches.');const branch={id:++this.next,name,address};this.rows.push(branch);return branch.id;}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={Branches};else root.DemoBranches={Branches};
})(typeof window!=='undefined'?window:globalThis);
