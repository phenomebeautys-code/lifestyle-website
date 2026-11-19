# Shop admin: gap to a Shopify-style back end

**Status:** Plan for review. Nothing in this document is built yet.
**Prepared:** 19 November 2026
**Scope:** `shop-admin.html` and its scripts, the `shop-admin` Edge Function, and the related Supabase tables and functions.

The comparison uses Shopify's publicly documented admin features. It does not use Shopify's code.

## 1. What the admin does today

| Area | What it can do |
|---|---|
| Sign-in | One shared password, checked by the `shop-admin` Edge Function, with a rate limit. No staff accounts or roles. |
| Hub | Headline numbers and recent orders. Refreshes on a timer. |
| Orders | List, filter and search. Order detail. Change status. Mark as paid. Export to CSV. Print a delivery label. |
| Products | Add, edit and delete. Variants and sizes with an in-stock flag per variant. Images. Drag to reorder. |
| Inventory & Stock | Stock levels and status per product (`stock-management`). |
| Materials & Recipes | Raw materials, stock, and recipes per product and variant (`materials-management`). Still in development. |
| Packaging | Box sizes for the Pudo shipping quote. |
| Reports | A basic reports page. |

Back-end pieces that are deployed but **not in this repository**: `stock-management`, `materials-management`, `consume-order-stock`, `export-shop-orders`, `reconcile-orders`, `process-shop-reminders`, `audit-reminded-orders`, `audit-reminder-email-delivery`, `send-shop-apology-once` and `yoco-payment-lookup`. They must be pulled into the repository before any change, so a redeploy can't overwrite live code with an older copy.

## 2. Gaps, by Shopify admin area

| Shopify area | Shopify does | We have | Gap |
|---|---|---|---|
| Staff and permissions | Named staff accounts, roles, activity log | One shared password | Staff sign-in (Supabase Auth), roles (owner, staff, fulfilment), audit log |
| Orders | Timeline, notes, tags, cancel, archive, edit items, refunds with restock, order risk | Status, mark paid | Timeline and notes, tags, cancel and archive, partial and full refunds through Yoco, restock on refund |
| Fulfilment | Fulfil, tracking number, shipping confirmation email, partial fulfilment | Print label | Create the Pudo shipment from the order, store tracking, email the customer, show fulfilment status |
| Draft orders | Create an order for a customer, send an invoice link | None | Manual orders with a Yoco payment link |
| Abandoned checkouts | List unpaid checkouts, send a recovery email | Reminder functions exist, no admin view | Admin view of unpaid orders and reminder status |
| Customers | Profiles, order history, lifetime spend, notes, tags, marketing consent, segments | Customer data only inside orders | Customers table built from orders, profile page, notes and tags, consent flag |
| Products | Status (draft, active, archived), compare-at price, cost and margin, SEO fields, tags, type, vendor, bulk edit, CSV import and export | Basic fields, availability | Status, compare-at price, margin from cost, SEO title and description, tags, bulk edit, CSV import and export |
| Collections | Manual and rule-based collections | Fixed `collection` field (intimate, body) | Editable collections and their order on the shop |
| Inventory | Per-variant quantities, adjustment history, low-stock alerts, transfers | Per-variant in-stock flag, product stock | Per-variant quantities, adjustment log, low-stock alert email |
| Purchase orders | Orders to suppliers that add stock on receipt | Materials only | Suppliers and purchase orders that update stock when received |
| Discounts | Codes, automatic discounts, percentage, fixed, free shipping, buy X get Y, limits, dates | None | Discount codes and automatic discounts. Needs checkout and server price changes. |
| Gift cards | Issue, sell, redeem, balance | None | Gift cards. Needs checkout and server changes. |
| Analytics | Sales over time, average order value, top products, returning customers, conversion | Basic reports | Sales dashboard with date ranges and comparisons |
| Marketing | Email campaigns, automations | Order emails only | Out of scope for now. Use a dedicated email tool if needed. |
| Online store | Theme editor, pages, blog, navigation | Static site in Git | Out of scope. Content changes stay in the repository. |
| Settings | Store details, payments, checkout, shipping zones and rates, taxes, notifications, policies | Spread across code and secrets | Settings page for store details, shipping rate overrides, notification wording and policies. VAT once its status is confirmed. |
| Search | Search across the whole admin | Order search only | Global search across orders, customers and products |

## 3. Recommended order of work

### Phase 1: foundation and day-to-day operations
1. Pull the deployed-only functions into the repository.
2. Staff accounts with Supabase Auth, roles, and an audit log. This replaces the shared password.
3. Order timeline, notes, tags, cancel and archive.
4. Refunds through Yoco, with optional restock.
5. Fulfilment: create the Pudo shipment from the order, store tracking, email the customer.
6. Customers built from order history, with a profile page.
7. Abandoned checkout view.

### Phase 2: selling tools
1. Product status, compare-at price, margin, SEO fields and tags.
2. Bulk edit, plus CSV import and export for products.
3. Editable collections.
4. Draft orders with payment links.
5. Discount codes and automatic discounts, enforced on the server.
6. Gift cards.

### Phase 3: insight and supply
1. Sales dashboard.
2. Per-variant stock quantities, adjustment log and low-stock alerts.
3. Suppliers and purchase orders.
4. Settings page.

## 4. Decisions needed before Phase 1

1. **Staff:** who needs access, and with which role (owner, staff, fulfilment only).
2. **Refunds:** whether refunds go back through Yoco automatically, or are recorded after a manual refund.
3. **Fulfilment emails:** whether customers get a shipping email with the Pudo tracking link.
4. **Supabase access:** the Supabase connector must be working. Phase 1 needs new tables and Edge Function deploys.

## 5. Rules that apply to every phase

- Database changes are additive. Removing data needs explicit approval.
- Prices, stock and discounts are checked on the server. The browser is never trusted for totals.
- Each feature ships with tests, and the shop and checkout tests must still pass.
- Live functions are pulled into the repository before they are changed.
