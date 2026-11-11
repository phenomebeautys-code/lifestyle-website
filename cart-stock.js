/* Cart availability, shared by the shop and checkout.
   A cart line is blocked when its product is no longer on sale, or when its chosen
   scent (variant) is out of stock. Stock is checked on the storefront and at checkout,
   so nobody reaches payment for an item that cannot be sold. */
(function (w) {
  function variantOf(product, name) {
    if (!name || !Array.isArray(product.variants)) return null;
    return product.variants.find(function (v) { return (v.name || v.label || v.value || '') === name; }) || null;
  }

  function lineProblem(item, products) {
    var product = (products || []).find(function (p) { return String(p.id) === String(item.productId); });
    if (!product) return 'This product is no longer available.';
    if (product.active !== true || product.availability !== 'available') return 'This product is not available to buy right now.';
    var v = variantOf(product, item.variant);
    if (v && v.in_stock === false) return 'This scent is out of stock.';
    return null;
  }

  w.PBCartStock = {
    lineProblem: lineProblem,
    /* Returns [{ index, item, reason }] for each blocked line. */
    problems: function (cart, products) {
      var out = [];
      (cart || []).forEach(function (item, index) {
        var reason = lineProblem(item, products);
        if (reason) out.push({ index: index, item: item, reason: reason });
      });
      return out;
    }
  };
})(window);
