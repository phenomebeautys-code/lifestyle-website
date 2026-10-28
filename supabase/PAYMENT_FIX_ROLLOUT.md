# Payment fixes: staged rollout

## Updated business rule

Stock deductions, reservations, recipe consumption and numeric inventory checks are deferred by the owner on 2026-10-28. They must not block sales or payment confirmation. Product/variant in-stock versus out-of-stock availability remains enforced. This supersedes the inventory prerequisites in NOTIFICATION_OUTBOX_ROLLOUT.md; do not implement those prerequisites as part of checkout.

PUDO dispatch remains manual. Payment must not create a shipment or mark an order delivered. Final customer delivery email remains tied to the owner's separate manual delivered action.

## This webhook change

Preserves mandatory signature verification and direct provider verification, removes the unfinished consume-order-stock call, selects verification columns on every order lookup, rejects missing currency, and checks order/checkout association. It does not query product stock or recipes. It does not create PUDO shipments.

Run: node --test supabase/functions/_shared/yoco-webhook.test.mjs
Twelve mocked tests passed during preparation. These are not real payment, email-delivery or production integration tests. No Deno typecheck is claimed. Before deployment, verify the actual Yoco checkout response includes id, amount, currency, completed status and metadata.order_id matching the saved order. Deploy the shared signature module with the function.

## Remaining work

The webhook still uses the existing direct email endpoint. A failure is reported as notification_accepted=false without undoing payment, but durable retry/deduplication requires the notification-outbox rollout. Do not treat the existing paid-state duplicate guard as proof of exactly-once email delivery.

Frontend size-aware shipping, fail-closed quote display, checkout-session idempotency, customer-token authorisation, manual delivered-status email recovery, and migration filename/ledger reconciliation remain separate work. Do not deploy the committed checkout server changes before the frontend shipping dependency is resolved.
