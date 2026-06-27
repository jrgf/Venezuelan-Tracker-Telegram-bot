const fs = require('fs');
const f = '/fzap/dist/main.js';
let c = fs.readFileSync(f, 'utf8');
const old = 'map(async u=>{let g=null,m=a.find';
const neu = 'map(async u=>{if(u.jid&&u.jid.includes("@lid"))return{exists:true,jid:u.jid,name:null,number:u.jid};let g=null,m=a.find';
if(c.includes(old)){
  c = c.replace(old, neu);
  fs.writeFileSync(f, c);
  console.log('PATCHED');
} else {
  console.log('NOT FOUND');
}
