const fs = require('fs');
const fetch = require('node-fetch');
async function main(){
  const storage = JSON.parse(fs.readFileSync('tests/e2e/storageState.json','utf8'));
  const origin = 'http://localhost:5000';
  const sessionEntry = storage.origins && storage.origins[0] && storage.origins[0].sessionStorage && storage.origins[0].sessionStorage.find(s=>s.name==='bgg-shop.session');
  const session = sessionEntry ? JSON.parse(sessionEntry.value) : null;
  const token = session && session.access_token;
  const cookies = (storage.cookies||[]).map(c=>`${c.name}=${c.value}`).join('; ');
  console.log('Using token:', !!token, 'cookies:', cookies);
  const url = `${origin}/api/v1/admin/products?search=Temp&page_size=1`;
  const res = await fetch(url, { headers: { 'Authorization': token?`Bearer ${token}`:'', 'Cookie': cookies } });
  console.log('status', res.status);
  const body = await res.text();
  console.log('body', body);
}
main().catch(e=>{ console.error(e); process.exit(1); });
