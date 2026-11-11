import test from 'node:test';
import assert from 'node:assert/strict';
import { CartError, moneyCents, trustedCart } from './trusted-cart.mjs';
const wax = {id:'film-wax-collection',name:'Film Wax',price:200,active:true,availability:'available',variants:[{name:'Type: Onyx',in_stock:true}],sizes:[{name:'500g',price:200},{name:'500g x 2',price:360}]};
const line = (size='500g',qty=1) => ({productId:wax.id,variant:'Type: Onyx',size,qty});
test('single pack costs R200',()=>assert.equal(trustedCart([line()],[wax]).subtotalCents,20000));
test('selected two-pack costs R360, not R200 or R400',()=>assert.equal(trustedCart([line('500g x 2')],[wax]).subtotalCents,36000));
test('two two-packs cost R720 and ship four physical packs',()=>{
  const result=trustedCart([line('500g x 2',2)],[wax]);
  assert.equal(result.subtotalCents,72000);
  assert.deepEqual(result.shippingItems,[{productId:wax.id,qty:4}]);
});
test('two single selections retain configured single price',()=>assert.equal(trustedCart([line('500g',2)],[wax]).subtotalCents,40000));
test('browser price/name/image/pack count cannot override catalogue',()=>{
  const result=trustedCart([{...line('500g x 2'),price:1,name:'fake',image:'fake',units_per_pack:1}],[wax]);
  assert.equal(result.items[0].price,360);assert.equal(result.items[0].name,'Film Wax');assert.equal(result.items[0].units_per_pack,2);
});
test('unknown or missing multi-size rejected',()=>{
  for(const size of ['fake','']) assert.throws(()=>trustedCart([line(size)],[wax]),CartError);
});
test('unknown variant rejected',()=>assert.throws(()=>trustedCart([{...line(),variant:'fake'}],[wax]),CartError));
test('out-of-stock variant rejected',()=>assert.throws(()=>trustedCart([line()],[{...wax,variants:[{name:'Type: Onyx',in_stock:false}]}]),CartError));
test('inactive and coming-soon products rejected',()=>{
  for(const patch of [{active:false},{availability:'coming_soon'}]) assert.throws(()=>trustedCart([line()],[{...wax,...patch}]),CartError);
});
test('invalid quantities rejected',()=>{
  for(const qty of [0,-1,1.5,51,Infinity,NaN,true,null,'']) assert.throws(()=>trustedCart([line('500g',qty)],[wax]),CartError);
});
test('malformed and unknown-product carts rejected',()=>{
  for(const cart of [[],null,{},[null],[{id:'missing',qty:1}]]) assert.throws(()=>trustedCart(cart,[wax]),CartError);
});
test('monetary validation rejects invalid configuration',()=>{
  for(const price of [null,true,-1,NaN,Infinity,'',0,'1.001']) assert.throws(()=>moneyCents(price),CartError);
  assert.equal(moneyCents('360.00'),36000);assert.equal(moneyCents('0.01'),1);
});
test('size price takes precedence over variant price, matching storefront',()=>assert.equal(trustedCart([line('500g x 2')],[{...wax,variants:[{name:'Type: Onyx',price:210}]}]).subtotalCents,36000));
test('base price is used for products without options',()=>assert.equal(trustedCart([{id:'kit',qty:1}],[{id:'kit',name:'Kit',price:440,active:true,availability:'available'}]).subtotalCents,44000));
test('single configured option can be resolved when omitted',()=>assert.equal(trustedCart([{id:'cream',qty:1}],[{id:'cream',price:260,name:'Cream',active:true,availability:'available',sizes:[{name:'250ml',price:260}]}]).items[0].size,'250ml'));
test('input catalogue and cart are not mutated',()=>{
  const cart=[line()];const before=JSON.stringify([cart,wax]);trustedCart(cart,[wax]);assert.equal(JSON.stringify([cart,wax]),before);
});
