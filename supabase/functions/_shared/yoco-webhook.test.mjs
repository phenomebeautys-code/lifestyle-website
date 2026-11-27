import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {verifyWebhook} from './yoco-signature.mjs';
globalThis.crypto ||= webcrypto;
const secret = btoa('test-signing-key-only');
const order = {id:'test-order',payment_status:'unpaid',total_amount:419,yoco_checkout_id:'ch_test',payment_id:null};
const checkout = {id:'ch_test',status:'completed',amount:41900,currency:'ZAR',metadata:{order_id:'test-order'},paymentId:'p_test'};
const event = {type:'payment.succeeded',payload:{id:'p_test',checkoutId:'ch_test',metadata:{order_id:'test-order'}}};
async function headersFor(raw) {
  const id='test-delivery';const timestamp='1793188800';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-signing-key-only'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
  return new Headers({'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':`v1,${btoa(String.fromCharCode(...new Uint8Array(digest)))}`});
}
function harness(overrides={}) {
  let handler;const calls={updates:[],urls:[],fields:[]};let operation='lookup';
  const client={from(table){operation='lookup';return {
    select(fields){calls.fields.push(fields);return this;},eq(){return this;},
    insert(row){calls.events=(calls.events||[]).concat(table==='order_events'?[row]:[]);return Promise.resolve({error:null});},
    maybeSingle(){return Promise.resolve(table==='shop_settings'?{data:overrides.savedSecret?{value:{secret:overrides.savedSecret}}:null,error:null}:{data:{...order,...overrides.order},error:null});},
    update(data){operation='update';calls.updates.push(data);return this;},
    then(resolve,reject){return Promise.resolve({data:overrides.concurrent?[]:[{id:order.id}],error:null}).then(resolve,reject);},
  };}};
  const deno={serve(fn){handler=fn;},env:{get(name){return {SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',YOCO_SECRET_KEY:'test-yoco',YOCO_WEBHOOK_SECRET:secret,...overrides.env}[name];}}};
  const fetchMock=async url=>{
    calls.urls.push(url);
    if(url.includes('/api/checkouts/')) return new Response(JSON.stringify({...checkout,...overrides.checkout}),{status:overrides.providerStatus||200});
    return new Response(JSON.stringify(overrides.emailFailure?{error:'mock failure'}:{ok:true}),{status:overrides.emailFailure?502:200});
  };
  const source=readFileSync(new URL('../yoco-webhook/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  new Function('createClient','verifyWebhook','Deno','fetch',source)(()=>client,verifyWebhook,deno,fetchMock);
  return {calls,async run(body=event,patchHeaders={}){
    const raw=JSON.stringify(body);const headers=await headersFor(raw);
    for(const [key,value] of Object.entries(patchHeaders)){if(value===null)headers.delete(key);else headers.set(key,value);}
    return handler(new Request('https://example.com',{method:'POST',headers,body:raw}));
  }};
}
test('valid signature verifies and tampered body fails',async()=>{
  const raw=JSON.stringify(event);const headers=await headersFor(raw);
  assert.equal(await verifyWebhook(raw,headers,secret),true);assert.equal(await verifyWebhook(raw+' ',headers,secret),false);
});
test('missing secret or signature fails closed',async()=>{
  for(const options of [{env:{YOCO_WEBHOOK_SECRET:''}},{}]) {
    const h=harness(options);const response=await h.run(event,options.env?{}:{'webhook-signature':null});
    assert.equal(response.status,401);assert.equal(h.calls.updates.length,0);
  }
});
test('verified payment confirms, consumes stock, emails and records the timeline (no PUDO)',async()=>{
  const h=harness();const response=await h.run();assert.equal(response.status,200);assert.equal(h.calls.updates[0].payment_status,'paid');
  assert.equal(h.calls.urls.length,3);assert.ok(h.calls.urls[0].includes('/api/checkouts/'));
  assert.ok(h.calls.urls[1].endsWith('/consume-order-stock'));assert.ok(h.calls.urls[2].endsWith('/send-order-email'));
  assert.ok(!h.calls.urls.some(u=>/pudo/i.test(u)));
  assert.equal(h.calls.events.length,1);assert.match(h.calls.events[0].message,/payment notification/);
});
test('checkout fallback selects total amount and stored checkout ID',async()=>{
  const h=harness();await h.run({...event,payload:{id:'p_test',checkoutId:'ch_test'}});
  const lookup=h.calls.fields.find(f=>f.includes('total_amount'));
  assert.ok(lookup);assert.ok(lookup.includes('yoco_checkout_id'));assert.equal(h.calls.updates.length,1);
});
test('a delivery signed with the saved (re-registered) secret is accepted',async()=>{
  const h=harness({env:{YOCO_WEBHOOK_SECRET:btoa('old-key-no-longer-used')},savedSecret:secret});
  const response=await h.run();assert.equal(response.status,200);assert.equal(h.calls.updates.length,1);
});
test('a delivery signed with neither secret is rejected',async()=>{
  const h=harness({env:{YOCO_WEBHOOK_SECRET:btoa('old-key')},savedSecret:btoa('other-key')});
  assert.equal((await h.run()).status,401);assert.equal(h.calls.updates.length,0);
});
test('wrong amount, currency, missing currency or unpaid provider status rejected',async()=>{
  for(const patch of [{amount:20000},{currency:'USD'},{currency:null},{status:'pending'}]) {
    const h=harness({checkout:patch});assert.equal((await h.run()).status,409);assert.equal(h.calls.updates.length,0);
  }
});
test('event and verified checkout associations must match order',async()=>{
  for(const patch of [{id:'ch_other'},{metadata:{order_id:'other'}},{paymentId:'p_other'}]) {
    const h=harness({checkout:patch});assert.equal((await h.run()).status,409);assert.equal(h.calls.updates.length,0);
  }
  const h=harness();assert.equal((await h.run({...event,payload:{...event.payload,checkoutId:'ch_other'}})).status,409);assert.equal(h.calls.urls.length,0);
});
test('duplicate paid callback does not resend notification',async()=>{
  const h=harness({order:{payment_status:'paid',payment_id:'p_test'}});assert.equal((await h.run()).status,200);assert.equal(h.calls.urls.length,0);assert.equal(h.calls.updates.length,0);
});
test('a different payment cannot reuse paid order',async()=>{
  const h=harness({order:{payment_status:'paid',payment_id:'p_other'}});assert.equal((await h.run()).status,409);assert.equal(h.calls.urls.length,0);
});
test('provider failure does not mark order paid',async()=>{
  const h=harness({providerStatus:503});assert.equal((await h.run()).status,503);assert.equal(h.calls.updates.length,0);
});
test('email failure is reported without undoing or blocking payment',async()=>{
  const h=harness({emailFailure:true});const response=await h.run();const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.processed,true);assert.equal(body.notification_accepted,false);assert.equal(h.calls.updates.length,1);
});
test('lost concurrent update does not send notification',async()=>{
  const h=harness({concurrent:true});assert.equal((await h.run()).status,200);assert.equal(h.calls.urls.length,1);
});
test('failed payment event cannot mark order paid',async()=>{
  const h=harness();assert.equal((await h.run({...event,type:'payment.failed'})).status,200);assert.equal(h.calls.updates.length,0);assert.equal(h.calls.urls.length,0);
});
