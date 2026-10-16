// Client: node c.mjs eval  < code.js        → {code}
//         node c.mjs <endpoint> '<json>'
import fs from 'node:fs';
const [endpoint, arg] = process.argv.slice(2);
let body;
if (endpoint === 'eval') body = JSON.stringify({ code: arg ?? fs.readFileSync(0, 'utf8') });
else body = arg ?? '{}';
const res = await fetch(`http://localhost:9330/${endpoint}`, { method: 'POST', body });
console.log(await res.text());
