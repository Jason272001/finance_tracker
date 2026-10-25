'use strict';
const HOME='https://www.keeperbma.com/';
function internal(value){try{const u=new URL(value);return u.protocol==='https:'&&['www.keeperbma.com','keeperbma.com'].includes(u.hostname)&&!u.username&&!u.password;}catch{return false;}}
function external(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
module.exports={HOME,internal,external};
