import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CartError, trustedCart } from './trusted-cart.mjs';
const wax = {id:'film-wax-collection',name:'Film Wax',price:200,active:true,availability:'available',variants:[{name:'Type: Onyx',in_stock:true}],sizes:[{name:'500g',price:200},{name:'500g x 2',price:360}]};
const item = {productId:wax.id,qty:1,variant:'Type: Onyx',size:'500g x 2',price:360};
const customer = {name:'Test Buyer',email:'buyer@example.com',phone:'0800000000'};
const address = {street:'Test Street',suburb:'Test Suburb',city:'Cape Town',postal:'8000',province:'Western Cape'};
const requestBody = {customer,delivery_method:'door',delivery_address:address,delivery_fee:59,cart:[item]};
const savedOrder = {id:'test-order',customer_token:'test-token',status:'pending',payment_status:'unpaid',items:[item],delivery_method:'door',delivery_fee:59,subtotal:360,total_amount:419,customer_email:customer.email};
function harness(kind, overrides={}) {
  const calls={inserted:[],updated:[],quotes:[],payments:[]};
  const database={from(table){
    let operation='read';
    const query={select(){return this;},in(){return this;},eq(){return this;},
      insert(value){operation='insert';calls.inserted.push(value);return this;},
      update(value){operation='update';calls.updated.push(value);return this;},
      single(){return Promise.resolve({data:operation==='insert'?{id:'test-order',customer_token:'test-token'}:{...savedOrder,...overrides.order},error:null});},
      maybeSingle(){return Promise.resolve(overrides.saveFails?{data:null,error:{message:'mock failure'}}:{data:{id:'test-order'},error:null});},
      then(resolve,reject){return Promise.resolve({data:overrides.products||[wax],error:null}).then(resolve,reject);}};
    return query;
  }};
  const fetchMock=async (url,options)=>{
    if(url.includes('get-shipping-quote')) {
      calls.quotes.push(JSON.parse(options.body));
      return new Response(JSON.stringify(overrides.quote||{door_fee:59,locker_fee:49,oversized:false}),{status:overrides.quoteStatus||200});
    }
    calls.payments.push(JSON.parse(options.body));
    return new Response(JSON.stringify(overrides.provider||{id:'ch_test',redirectUrl:'https://payments.yoco.com/test'}),{status:overrides.providerStatus||200});
  };
  let handler;
  const deno={serve(fn){handler=fn;},env:{get(name){return {SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',YOCO_SECRET_KEY:'test-yoco'}[name];}}};
  const path=kind==='order'?'../create-order/index.ts':'../yoco-shop-checkout/index.ts';
  const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  new Function('createClient','CartError','trustedCart','Deno','fetch',source)(()=>database,CartError,trustedCart,deno,fetchMock);
  return {calls,run(body=kind==='order'?requestBody:{order_id:'test-order',success_url:'https://www.phenomebeauty.co.za/shop-success.html',cancel_url:'https://www.phenomebeauty.co.za/shop.html'},method='POST'){
    return handler(new Request('https://example.com',{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
  }};
}
test('order stores R360 two-pack and quotes two physical packs',async()=>{
  const h=harness('order');const response=await h.run();assert.equal(response.status,200);
  assert.equal(h.calls.inserted[0].subtotal,360);assert.equal(h.calls.inserted[0].total_amount,419);
  assert.deepEqual(h.calls.quotes[0].items,[{productId:wax.id,qty:2}]);
});
test('order rejects quote failure without fallback or insert',async()=>{
  const h=harness('order',{quoteStatus:503});assert.equal((await h.run()).status,503);assert.equal(h.calls.inserted.length,0);
});
test('order rejects unavailable locker rate instead of coercing null to zero',async()=>{
  const h=harness('order',{quote:{door_fee:59,locker_fee:null}});
  assert.equal((await h.run({...requestBody,delivery_method:'locker',locker_id:'test',locker_name:'Test',locker_address:'Test Street'})).status,409);
  assert.equal(h.calls.inserted.length,0);
});
test('order rejects stale browser shipping total',async()=>{
  const h=harness('order');assert.equal((await h.run({...requestBody,delivery_fee:1})).status,409);assert.equal(h.calls.inserted.length,0);
});
test('order rejects oversized unverified standard tariff',async()=>{
  const h=harness('order',{quote:{door_fee:59,oversized:true}});assert.equal((await h.run()).status,409);assert.equal(h.calls.inserted.length,0);
});
test('order validates complete address before persistence',async()=>{
  const h=harness('order');assert.equal((await h.run({...requestBody,delivery_address:{street:'Test'}})).status,400);assert.equal(h.calls.inserted.length,0);
});
test('order enforces configured variant unavailability',async()=>{
  const h=harness('order',{products:[{...wax,variants:[{name:'Type: Onyx',in_stock:false}]}]});assert.equal((await h.run()).status,409);assert.equal(h.calls.inserted.length,0);
});
test('payment uses trusted R360 price plus quoted delivery in cents',async()=>{
  const h=harness('payment');const response=await h.run();assert.equal(response.status,200);
  assert.equal(h.calls.payments[0].amount,41900);assert.equal(h.calls.payments[0].currency,'ZAR');
  assert.equal(new URL(h.calls.payments[0].successUrl).searchParams.get('ct'),'test-token');
});
test('payment refuses stale order totals before calling Yoco',async()=>{
  const h=harness('payment',{order:{subtotal:200,total_amount:259}});assert.equal((await h.run()).status,409);assert.equal(h.calls.payments.length,0);assert.equal(h.calls.updated.length,0);
});
test('payment refuses already-paid order',async()=>{
  const h=harness('payment',{order:{payment_status:'paid'}});assert.equal((await h.run()).status,409);assert.equal(h.calls.payments.length,0);
});
test('payment fails closed when checkout ID cannot be persisted',async()=>{
  const h=harness('payment',{saveFails:true});const response=await h.run();assert.equal(response.status,503);assert.equal((await response.json()).redirectUrl,undefined);
});
test('payment rejects provider errors and malformed sessions',async()=>{
  for(const overrides of [{providerStatus:502},{provider:{redirectUrl:'https://example.com'}}]) {
    const h=harness('payment',overrides);assert.equal((await h.run()).status,502);assert.equal(h.calls.updated.length,0);
  }
});
test('payment rejects external return URLs before provider call',async()=>{
  const h=harness('payment');assert.equal((await h.run({order_id:'test-order',success_url:'https://evil.example',cancel_url:'https://www.phenomebeauty.co.za/shop.html'})).status,400);assert.equal(h.calls.payments.length,0);
});
test('handlers enforce methods and allow preflight',async()=>{
  for(const kind of ['order','payment']) {const h=harness(kind);assert.equal((await h.run(null,'GET')).status,405);assert.equal((await h.run(null,'OPTIONS')).status,204);}
});
