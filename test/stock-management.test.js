import { describe, expect, it } from 'vitest';
import {
  getStockStatus,
  getStockRecommendation,
  getStockRecommendations,
  getStockSummary,
  buildStockReadRequest,
} from '../stock-management.js';

describe('stock management helpers', () => {
  it('classifies a product with stock above its threshold as in stock', () => {
    expect(getStockStatus({ stock_on_hand: 8, reorder_level: 3 })).toBe('in_stock');
  });

  it('classifies stock at the threshold as low stock', () => {
    expect(getStockStatus({ stock_on_hand: 3, reorder_level: 3 })).toBe('low_stock');
  });

  it('classifies zero stock as out of stock', () => {
    expect(getStockStatus({ stock_on_hand: 0, reorder_level: 3 })).toBe('out_of_stock');
  });

  it('preserves discontinued status', () => {
    expect(getStockStatus({ stock_on_hand: 0, reorder_level: 3, stock_status: 'discontinued' })).toBe('discontinued');
    expect(getStockRecommendation({ id: 'p1', name: 'Old product', stock_on_hand: 0, reorder_level: 3, stock_status: 'discontinued' })).toBeNull();
  });

  it('uses a configured reorder quantity', () => {
    const recommendation = getStockRecommendation({
      id: 'p1',
      name: 'Facial serum',
      cost_price: 100,
      stock_on_hand: 2,
      reorder_level: 3,
      reorder_quantity: 12,
    });

    expect(recommendation).toMatchObject({
      productId: 'p1',
      status: 'low_stock',
      urgency: 'soon',
      reorderQuantity: 12,
      estimatedCost: 1200,
    });
  });

  it('calculates a reorder quantity when none is configured', () => {
    const recommendation = getStockRecommendation({
      id: 'p1',
      name: 'Body oil',
      stock_on_hand: 2,
      reorder_level: 5,
      reorder_quantity: 0,
    });

    expect(recommendation.reorderQuantity).toBe(8);
  });

  it('sorts urgent recommendations before soon recommendations', () => {
    const recommendations = getStockRecommendations([
      { id: 'p1', name: 'Low product', stock_on_hand: 1, reorder_level: 2 },
      { id: 'p2', name: 'Out product', stock_on_hand: 0, reorder_level: 2 },
    ]);

    expect(recommendations.map((item) => item.productId)).toEqual(['p2', 'p1']);
  });

  it('summarises replenishment cost and counts', () => {
    const summary = getStockSummary([
      { id: 'p1', name: 'Out product', stock_on_hand: 0, reorder_level: 2, reorder_quantity: 5, cost_price: 100 },
      { id: 'p2', name: 'Healthy product', stock_on_hand: 10, reorder_level: 2, cost_price: 50 },
    ]);

    expect(summary).toMatchObject({
      totalProducts: 2,
      urgentCount: 1,
      estimatedReorderCost: 500,
    });
    expect(summary.recommendations).toHaveLength(1);
  });

  it('builds a read-only product request', () => {
    const request = buildStockReadRequest({ endpoint: '/functions/v1/stock-management', password: 'secret' });
    expect(request.url).toBe('/functions/v1/stock-management');
    expect(request.options.method).toBe('POST');
    expect(JSON.parse(request.options.body)).toEqual({ action: 'get_products', password: 'secret' });
  });
});
