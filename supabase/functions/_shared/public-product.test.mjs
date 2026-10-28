import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_PRODUCT_COLUMNS, toPublicProduct } from './public-product.mjs';

test('query has no wildcard or internal stock/cost fields', () => {
  assert.ok(!PUBLIC_PRODUCT_COLUMNS.includes('*'));
  for (const field of ['cost_price', 'stock_on_hand', 'reorder_level', 'reorder_quantity']) {
    assert.ok(!PUBLIC_PRODUCT_COLUMNS.split(',').includes(field));
  }
});
test('unknown and internal product columns are never returned', () => {
  assert.deepEqual(toPublicProduct({id:'wax', price:200, cost_price:80, stock_on_hand:-3, future_secret:'private'}),
    {id:'wax', price:200, variants:[], sizes:[]});
});
test('size prices are preserved without substituting base price', () => {
  const p = toPublicProduct({price:200, sizes:[{name:'500g',price:200},{name:'500g x 2',price:360,cost_price:90}]});
  assert.deepEqual(p.sizes, [{name:'500g',price:200},{name:'500g x 2',price:360}]);
});
test('variant availability, images and prices survive projection', () => {
  const option = {name:'Type: Onyx',in_stock:false,image:'https://example.com/wax.png',price:200};
  assert.deepEqual(toPublicProduct({variants:[{...option,cost_price:50,supplier:'internal'}]}).variants,[option]);
});
test('display and segmentation fields are preserved', () => {
  const display = {name:'Wax',market:'professional',hero_segment:'professional',includes:['Wax'],available_in:['Onyx'],active:true,availability:'available',image_urls:['wax.png']};
  assert.deepEqual(toPublicProduct(display),{...display,variants:[],sizes:[]});
});
test('malformed options do not throw or leak data', () => {
  assert.deepEqual(toPublicProduct({variants:[null,1,'invalid',[],{name:'valid',token:'private'}],sizes:null}).variants,[{name:'valid'}]);
});
test('projection does not modify database objects', () => {
  const source = {price:200,variants:[{name:'Onyx',cost_price:80}]};
  const before = JSON.stringify(source);
  toPublicProduct(source);
  assert.equal(JSON.stringify(source),before);
});
