# Notification outbox: staged rollout

## Target and status

Target: PhenomeBeauty website project `papdxjcfimeyjgzmatpl`.
Source baseline inspected: main commit `0e6c6412bffec580fe9bc7a3bf167dc186c08623`.
Migration: `20261028114500_add_shop_notification_outbox.sql`.
This commit does not apply the migration or deploy any Edge Function.
The SQL has not been executed or integration-tested at the time of preparation.

## Verified basis

Read-only live catalog inspection on 2026-10-28 found no public table triggers and no public order/inventory transaction RPC. The existing sale uniqueness index covers reference_type, reference_id and product_id; it does not make separate Edge Function stock updates transactional.

Deployed yoco-webhook v25 already requires a signature and keeps PUDO dispatch manual. Git contains an older webhook. Preserve the live security fixes when reconciling source. Its paid-state early return can suppress recovery of downstream stock/email failures.

Deployed send-order-email v26 sends customer and owner payment notifications separately, but has no durable per-recipient deduplication. Deployed shop-admin v46 updates delivery status before requesting the email; a failed send cannot be recovered by repeating the unchanged status action. These are source-inspection findings, not end-to-end test results.

## Migration impact

Adds one empty service-role-only table, two partial indexes and one policy. No existing table, row, price, stock quantity or migration-history row is changed. The order foreign key restricts deletion of orders referenced by future notification rows. There is no backfill and no trigger. No email or shipment can be created by this migration. Existing application behavior remains unchanged until the subsequent cutover.

The migration intentionally fails if the relation already exists rather than silently accepting an incompatible schema. Do not edit an applied migration or mark it applied based only on a filename.

## Required implementation before activation

1. Reconcile live migration history with repository SQL without replaying historical debug/data migrations or exposing secrets. Complete constraint and dependency inspection.
2. Introduce a transaction that validates payment evidence and atomically updates order state and enqueues separate payment_received/customer and payment_received/owner rows. Handle stock reservation and consumption transactionally; this table does not prevent overselling.
3. Enqueue delivered/customer only inside the authorised manual delivered-status transition on an already-paid order. Never enqueue it from payment or shipment creation.
4. Implement a service-authorised worker that claims rows atomically with row locks and leases, uses stable provider idempotency keys per outbox row, records each recipient result independently, and retries failures with backoff. Preserve provider idempotency retention limits; ambiguous sends outside that window require reconciliation rather than blind resend.
5. Disable the corresponding direct sends at cutover. Do not run the new worker alongside old direct-send paths for the same events. Do not backfill historical paid or delivered orders without a separately reviewed reconciliation plan.
6. Keep shipment creation, locker drop-off and delivered confirmation owner-controlled. No automatic PUDO creation from any payment path.

## Verification required

Before application, inspect for an existing outbox relation and confirm target project. After application, verify columns, constraints, indexes, grants, RLS and migration ledger. Confirm anon/authenticated have no outbox access.

Before activating the worker, test duplicate/concurrent payment callbacks, per-recipient email failure, crash after provider acceptance, expired leases, repeated manual delivery actions and rollback on transaction failure. Assert one durable event per order/event/recipient and no automatic shipment call. A provider accepting an email is not proof of delivery.

## Not yet complete

No checkout, payment, inventory, shipping, notification or admin-delivery workflow is certified by this foundation migration. No tests, lint, typecheck or build are claimed as run in this commit. Application changes and deployment require separate reviewed writes and verification.
