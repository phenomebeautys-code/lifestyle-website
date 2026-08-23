/* ─── AVAILABILITY HELPERS ────────────────────── */

const AVAILABILITY_LABELS = {
  available: null,
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

const RIBBON_LABELS = {
  available: 'Available',
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

/* ─── PRODUCTS ────────────────────────────────── */

function getProductImages(product) {
  if (Array.isArray(product.image_urls) && product.image_urls.length) {
    return product.image_urls.filter(Boolean).slice(0, 5);
  }

  if (product.image_url) {
    return [product.image_url];
  }

  return [];
}

async function loadProducts() {
  document.getElementById('productsGrid').innerHTML =
    '<div class="products-empty" style="grid-column:1/-1"><span class="spinner"></span> Loading…</div>';

  try {
    const response = await callEdge({
      action: 'get_products',
      password: adminToken,
    });

    if (response.ok) {
      const data = await response.json();

      if (Array.isArray(data.products)) {
        allProducts = data.products;
        renderProducts();
        return;
      }
    }

    await loadProductsFromRest();
  } catch {
    await loadProductsFromRest();
  }
}

async function loadProductsFromRest() {
  try {
    const response = await fetch(
      `${SUPA_URL}/rest/v1/${PRODUCTS_TABLE}?order=idx.asc`,
      {
        headers: {
          apikey: SUPA_ANON,
          Authorization: `Bearer ${SUPA_ANON}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      allProducts = [];
      renderProducts();
      showToast(`Could not load products: ${response.status}`, true);
      return;
    }

    allProducts = await response.json();
    renderProducts();
  } catch {
    allProducts = [];
    renderProducts();
  }
}

function renderProducts() {
  const searchQuery = (
    document.getElementById('productSearch')?.value || ''
  ).toLowerCase();

  const container = document.getElementById('productsGrid');

  const products = searchQuery
    ? allProducts.filter(product => {
      return (
        product.name?.toLowerCase().includes(searchQuery) ||
        product.brand?.toLowerCase().includes(searchQuery)
      );
    })
    : allProducts;

  if (!products.length) {
    container.innerHTML = `
      <div class="products-empty" style="grid-column:1/-1">
        No products yet.<br>
        <button class="btn btn-primary" id="emptyAddBtn" style="margin-top:16px">
          Add your first product
        </button>
      </div>
    `;

    document
      .getElementById('emptyAddBtn')
      ?.addEventListener('click', () => openProductModal());

    return;
  }

  container.innerHTML = '';

  products.forEach((product, productIndex) => {
    const card = document.createElement('div');

    card.className =
      'product-card' + (isReorderMode ? ' reorder-mode' : '');

    card.dataset.productId = product.id;

    const variantDisplay = (product.variants || [])
      .map(variant => {
        const name =
          typeof variant === 'string'
            ? variant
            : variant.name || '';

        const inStock =
          typeof variant === 'string'
            ? true
            : variant.in_stock !== false;

        return name ? (inStock ? name : `${name} ✖`) : null;
      })
      .filter(Boolean)
      .join(', ');

    const sizeDisplay = normaliseSizes(product.sizes)
      .map(size => `${size.name} (R${size.price})`)
      .join(', ');

    const images = getProductImages(product);
    const availability = product.availability || 'available';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-img-wrap';

    if (images.length > 1) {
      const carousel = document.createElement('div');
      carousel.className = 'img-carousel';

      const track = document.createElement('div');
      track.className = 'img-carousel-track';

      images.forEach((url, imageIndex) => {
        const slide = document.createElement('div');
        slide.className = 'img-carousel-slide';

        const image = document.createElement('img');

        image.src = url;
        image.alt = `${product.name || ''} ${imageIndex + 1}`;

        image.onerror = () => {
          slide.innerHTML = noImgSVG();
        };

        slide.appendChild(image);
        track.appendChild(slide);
      });

      carousel.appendChild(track);

      const dots = document.createElement('div');
      dots.className = 'img-carousel-dots';

      let currentSlide = 0;

      const dotElements = images.map((_, imageIndex) => {
        const dot = document.createElement('button');

        dot.className =
          'img-carousel-dot' + (imageIndex === 0 ? ' active' : '');

        dot.setAttribute('aria-label', `Image ${imageIndex + 1}`);

        dot.addEventListener('click', () => {
          goToSlide(imageIndex);
        });

        dots.appendChild(dot);

        return dot;
      });

      const previousButton = document.createElement('button');
      previousButton.className = 'img-carousel-btn img-carousel-prev';
      previousButton.innerHTML = '&#8249;';
      previousButton.setAttribute('aria-label', 'Previous image');

      const nextButton = document.createElement('button');
      nextButton.className = 'img-carousel-btn img-carousel-next';
      nextButton.innerHTML = '&#8250;';
      nextButton.setAttribute('aria-label', 'Next image');

      function goToSlide(index) {
        currentSlide = (index + images.length) % images.length;

        track.style.transform =
          `translateX(-${currentSlide * 100}%)`;

        dotElements.forEach((dot, dotIndex) => {
          dot.classList.toggle('active', dotIndex === currentSlide);
        });
      }

      previousButton.addEventListener('click', () => {
        goToSlide(currentSlide - 1);
      });

      nextButton.addEventListener('click', () => {
        goToSlide(currentSlide + 1);
      });

      carousel.appendChild(previousButton);
      carousel.appendChild(nextButton);
      carousel.appendChild(dots);

      imageWrap.appendChild(carousel);
    } else if (images.length === 1) {
      const image = document.createElement('img');

      image.src = images[0];
      image.alt = product.name || '';

      image.onerror = () => {
        imageWrap.innerHTML = noImgSVG();
      };

      imageWrap.appendChild(image);
    } else {
      imageWrap.innerHTML = noImgSVG();
    }

    const ribbon = document.createElement('span');

    ribbon.className =
      `prod-avail-ribbon ribbon-${availability.replace(/_/g, '-')}`;

    ribbon.textContent =
      RIBBON_LABELS[availability] || availability;

    imageWrap.appendChild(ribbon);

    const body = document.createElement('div');
    body.className = 'product-card-body';

    body.innerHTML = `
      <div class="product-price">
        R${Number(product.price || 0).toLocaleString('en-ZA')}
        ${
          sizeDisplay
            ? '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:400">(base)</span>'
            : ''
        }
      </div>

      ${
        product.category
          ? `<div class="product-cat">${esc(product.category)}</div>`
          : ''
      }

      <div class="product-name">
        ${esc(product.name || 'Unnamed product')}
      </div>

      ${
        product.brand
          ? `<div class="product-brand">${esc(product.brand)}</div>`
          : ''
      }

      ${
        variantDisplay
          ? `<div class="product-variant">${esc(variantDisplay)}</div>`
          : ''
      }

      ${
        sizeDisplay
          ? `<div class="product-variant">Sizes: ${esc(sizeDisplay)}</div>`
          : ''
      }

      ${
        product.description
          ? `<div class="product-desc">${esc(product.description)}</div>`
          : ''
      }
    `;

    const footer = document.createElement('div');
    footer.className = 'product-card-footer';

    if (!isReorderMode) {
      const availabilityBadge = document.createElement('span');

      availabilityBadge.className =
        `prod-footer-badge badge-${availability.replace(/_/g, '-')}`;

      availabilityBadge.textContent =
        RIBBON_LABELS[availability] || availability;

      const spacer = document.createElement('span');
      spacer.className = 'prod-footer-spacer';

      const editButton = document.createElement('button');
      editButton.className = 'btn-edit-prod';
      editButton.textContent = 'Edit';

      editButton.addEventListener('click', () => {
        openProductModal(product);
      });

      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn-delete-prod';
      deleteButton.textContent = 'Delete';

      deleteButton.addEventListener('click', () => {
        deleteProduct(product.id, product.name);
      });

      footer.appendChild(availabilityBadge);
      footer.appendChild(spacer);
      footer.appendChild(editButton);
      footer.appendChild(deleteButton);
    } else {
      const totalProducts = products.length;
      const currentPosition = productIndex + 1;

      const moveUpButton = document.createElement('button');

      moveUpButton.className = 'btn-reorder-up';
      moveUpButton.innerHTML = '&#8593;';
      moveUpButton.title = 'Move up';
      moveUpButton.disabled = productIndex === 0;

      moveUpButton.addEventListener('click', () => {
        moveProduct(productIndex, -1);
      });

      const moveDownButton = document.createElement('button');

      moveDownButton.className = 'btn-reorder-down';
      moveDownButton.innerHTML = '&#8595;';
      moveDownButton.title = 'Move down';
      moveDownButton.disabled = productIndex === totalProducts - 1;

      moveDownButton.addEventListener('click', () => {
        moveProduct(productIndex, 1);
      });

      const positionInput = document.createElement('input');

      positionInput.type = 'number';
      positionInput.className = 'reorder-pos-input';
      positionInput.value = currentPosition;
      positionInput.min = 1;
      positionInput.max = totalProducts;
      positionInput.title = 'Type position and press Enter';

      positionInput.addEventListener('change', () => {
        const requestedPosition = parseInt(positionInput.value, 10);

        if (!Number.isNaN(requestedPosition)) {
          moveProductToIndex(productIndex, requestedPosition);
        }
      });

      positionInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          positionInput.blur();
        }
      });

      const positionLabel = document.createElement('span');

      positionLabel.style.cssText =
        'font-size:0.7rem;color:var(--text-muted);white-space:nowrap;';

      positionLabel.textContent = `of ${totalProducts}`;

      footer.appendChild(moveUpButton);
      footer.appendChild(moveDownButton);
      footer.appendChild(positionInput);
      footer.appendChild(positionLabel);
    }

    card.appendChild(imageWrap);
    card.appendChild(body);
    card.appendChild(footer);

    container.appendChild(card);
  });
}

function noImgSVG() {
  return `
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  `;
}

/* ─── REORDER MODE ────────────────────────────── */

function toggleReorderMode() {
  isReorderMode = !isReorderMode;

  const button = document.getElementById('reorderBtn');
  const hint = document.getElementById('reorderHint');
  const search = document.getElementById('productSearch');

  if (isReorderMode) {
    button.innerHTML = '&#10003; Done Reordering';
    button.classList.add('btn-primary');
    button.classList.remove('btn-secondary');

    hint.style.display = 'flex';
    search.style.display = 'none';
  } else {
    button.innerHTML = '&#8597; Reorder';
    button.classList.remove('btn-primary');
    button.classList.add('btn-secondary');

    hint.style.display = 'none';
    search.style.display = '';
  }

  renderProducts();
}

async function moveProduct(index, direction) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= allProducts.length) {
    return;
  }

  const movedProduct = allProducts.splice(index, 1)[0];

  allProducts.splice(nextIndex, 0, movedProduct);

  renderProducts();

  await saveProductOrder();
}

async function moveProductToIndex(fromIndex, targetPosition) {
  const targetIndex = Math.min(
    Math.max(targetPosition - 1, 0),
    allProducts.length - 1
  );

  if (targetIndex === fromIndex) {
    return;
  }

  const movedProduct = allProducts.splice(fromIndex, 1)[0];

  allProducts.splice(targetIndex, 0, movedProduct);

  renderProducts();

  await saveProductOrder();
}

async function saveProductOrder() {
  const order = allProducts.map((product, index) => ({
    id: product.id,
    idx: index,
  }));

  try {
    const response = await callEdge({
      action: 'reorder_products',
      password: adminToken,
      order,
    });

    if (!response.ok) {
      showToast('Failed to save order.', true);
      return;
    }

    allProducts.forEach((product, index) => {
      product.idx = index;
    });

    showToast('Order saved');
  } catch {
    showToast('Network error saving order.', true);
  }
}

/* ─── SIZE HELPERS ────────────────────────────── */

function normaliseSizes(rawSizes) {
  if (!Array.isArray(rawSizes)) {
    return [];
  }

  return rawSizes
    .map(size => ({
      name: (size.name || '').trim(),
      price: Number(size.price) || 0,
    }))
    .filter(size => size.name);
}

/* ─── PRODUCT MODAL ───────────────────────────── */

function openProductModal(product = null) {
  document.getElementById('modalTitle').textContent =
    product ? 'Edit Product' : 'Add Product';

  document.getElementById('modalProductId').value =
    product?.id || '';

  document.getElementById('mpName').value =
    product?.name || '';

  document.getElementById('mpPrice').value =
    product?.price || '';

  document.getElementById('mpCost').value =
    product?.cost_price || '';

  document.getElementById('mpSku').value =
    product?.sku || '';

  document.getElementById('mpBrand').value =
    product?.brand || '';

  document.getElementById('mpDesc').value =
    product?.description || '';

  document.getElementById('mpCategory').value =
    product?.category || '';

  document.getElementById('mpAvailability').value =
    product?.availability || 'available';

  const images = product ? getProductImages(product) : [];

  document.getElementById('mpImage1').value = images[0] || '';
  document.getElementById('mpImage2').value = images[1] || '';
  document.getElementById('mpImage3').value = images[2] || '';
  document.getElementById('mpImage4').value = images[3] || '';
  document.getElementById('mpImage5').value = images[4] || '';

  editingVariants = (product?.variants || [])
    .map(variant => {
      if (typeof variant === 'string') {
        return {
          name: variant,
          in_stock: true,
        };
      }

      return {
        name: variant.name || '',
        in_stock: variant.in_stock !== false,
      };
    })
    .filter(variant => variant.name);

  editingSizes = normaliseSizes(product?.sizes || []);

  renderVariantRows();
  renderSizeRows();

  document.getElementById('productModal').removeAttribute('hidden');
  document.getElementById('mpName').focus();
}

function closeProductModal() {
  document.getElementById('productModal').setAttribute('hidden', '');
}

function renderVariantRows() {
  const container = document.getElementById('variantsList');

  container.innerHTML = '';

  editingVariants.forEach((variant, index) => {
    const row = document.createElement('div');

    row.className = 'variant-row';

    row.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    const input = document.createElement('input');

    input.type = 'text';
    input.value = variant.name;
    input.placeholder = 'e.g. Scent: Calm';
    input.style.flex = '1';

    input.addEventListener('input', () => {
      editingVariants[index].name = input.value;
    });

    const label = document.createElement('label');

    label.style.cssText =
      'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;white-space:nowrap;user-select:none;';

    const checkbox = document.createElement('input');

    checkbox.type = 'checkbox';
    checkbox.checked = variant.in_stock;

    checkbox.style.cssText =
      'accent-color:var(--accent);width:14px;height:14px;cursor:pointer;';

    const stockText = document.createElement('span');

    stockText.textContent = variant.in_stock
      ? 'In Stock'
      : 'Out of Stock';

    stockText.style.color = variant.in_stock
      ? 'var(--accent)'
      : '#f87171';

    checkbox.addEventListener('change', () => {
      editingVariants[index].in_stock = checkbox.checked;

      stockText.textContent = checkbox.checked
        ? 'In Stock'
        : 'Out of Stock';

      stockText.style.color = checkbox.checked
        ? 'var(--accent)'
        : '#f87171';
    });

    label.appendChild(checkbox);
    label.appendChild(stockText);

    const removeButton = document.createElement('button');

    removeButton.className = 'btn-remove-variant';
    removeButton.innerHTML = '&times;';
    removeButton.type = 'button';

    removeButton.addEventListener('click', () => {
      editingVariants.splice(index, 1);
      renderVariantRows();
    });

    row.appendChild(input);
    row.appendChild(label);
    row.appendChild(removeButton);

    container.appendChild(row);
  });
}

function addVariantRow() {
  editingVariants.push({
    name: '',
    in_stock: true,
  });

  renderVariantRows();

  const inputs = document
    .getElementById('variantsList')
    .querySelectorAll('input[type="text"]');

  inputs[inputs.length - 1]?.focus();
}

function renderSizeRows() {
  const container = document.getElementById('sizesList');

  container.innerHTML = '';

  editingSizes.forEach((size, index) => {
    const row = document.createElement('div');

    row.className = 'variant-row';

    row.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    const nameInput = document.createElement('input');

    nameInput.type = 'text';
    nameInput.value = size.name;
    nameInput.placeholder = 'e.g. 50ml';
    nameInput.style.flex = '1';

    nameInput.addEventListener('input', () => {
      editingSizes[index].name = nameInput.value;
    });

    const priceWrap = document.createElement('div');

    priceWrap.style.cssText =
      'display:flex;align-items:center;gap:4px;flex-shrink:0;';

    const pricePrefix = document.createElement('span');

    pricePrefix.textContent = 'R';

    pricePrefix.style.cssText =
      'font-size:0.82rem;color:var(--text-muted);font-weight:600;';

    const priceInput = document.createElement('input');

    priceInput.type = 'number';
    priceInput.value = size.price || '';
    priceInput.placeholder = '0.00';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.style.cssText = 'width:80px;';

    priceInput.addEventListener('input', () => {
      editingSizes[index].price =
        parseFloat(priceInput.value) || 0;
    });

    priceWrap.appendChild(pricePrefix);
    priceWrap.appendChild(priceInput);

    const removeButton = document.createElement('button');

    removeButton.className = 'btn-remove-variant';
    removeButton.innerHTML = '&times;';
    removeButton.type = 'button';

    removeButton.addEventListener('click', () => {
      editingSizes.splice(index, 1);
      renderSizeRows();
    });

    row.appendChild(nameInput);
    row.appendChild(priceWrap);
    row.appendChild(removeButton);

    container.appendChild(row);
  });
}

function addSizeRow() {
  editingSizes.push({
    name: '',
    price: 0,
  });

  renderSizeRows();

  const inputs = document
    .getElementById('sizesList')
    .querySelectorAll('input[type="text"]');

  inputs[inputs.length - 1]?.focus();
}

async function saveProduct() {
  const button = document.getElementById('modalSaveBtn');

  const productId = document.getElementById('modalProductId').value;

  const name = document.getElementById('mpName').value.trim();

  if (!name) {
    showToast('Product name is required.', true);
    return;
  }

  const imageUrls = [
    document.getElementById('mpImage1').value.trim(),
    document.getElementById('mpImage2').value.trim(),
    document.getElementById('mpImage3').value.trim(),
    document.getElementById('mpImage4').value.trim(),
    document.getElementById('mpImage5').value.trim(),
  ].filter(Boolean);

  const cleanSizes = editingSizes
    .filter(size => size.name.trim())
    .map(size => ({
      name: size.name.trim(),
      price: size.price,
    }));

  const payload = {
    action: productId ? 'update_product' : 'add_product',
    password: adminToken,
    product: {
      ...(productId && { id: productId }),
      name,
      price:
        parseFloat(document.getElementById('mpPrice').value) || 0,
      cost_price:
        parseFloat(document.getElementById('mpCost').value) || 0,
      sku:
        document.getElementById('mpSku').value.trim(),
      brand:
        document.getElementById('mpBrand').value.trim(),
      description:
        document.getElementById('mpDesc').value.trim(),
      image_url: imageUrls[0] || '',
      image_urls: imageUrls,
      category:
        document.getElementById('mpCategory').value.trim(),
      availability:
        document.getElementById('mpAvailability').value || 'available',
      variants: editingVariants
        .filter(variant => variant.name.trim())
        .map(variant => ({
          name: variant.name.trim(),
          in_stock: variant.in_stock,
        })),
      sizes: cleanSizes,
    },
  };

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>Saving…';

  try {
    const response = await callEdge(payload);

    if (response.status === 429) {
      showToast('Rate limited.', true);
      return;
    }

    if (!response.ok) {
      showToast('Failed to save product.', true);
      return;
    }

    const data = await response.json();

    if (productId) {
      const index = allProducts.findIndex(
        product => product.id === productId
      );

      if (index > -1) {
        allProducts[index] = data.product || allProducts[index];
      }
    } else {
      allProducts.unshift(data.product || payload.product);
    }

    renderProducts();
    closeProductModal();

    showToast(productId ? 'Product updated' : 'Product added');
  } catch {
    showToast('Network error.', true);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Save Product';
  }
}

async function deleteProduct(productId, productName) {
  if (!confirm(`Delete "${productName}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await callEdge({
      action: 'delete_product',
      password: adminToken,
      product_id: productId,
    });

    if (!response.ok) {
      showToast('Failed to delete.', true);
      return;
    }

    allProducts = allProducts.filter(
      product => product.id !== productId
    );

    renderProducts();

    showToast('Product deleted.');
  } catch {
    showToast('Network error.', true);
  }
}
