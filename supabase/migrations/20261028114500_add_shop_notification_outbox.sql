-- Additive foundation only: no triggers, backfill, email sends or shipment calls.
-- Apply to papdxjcfimeyjgzmatpl only after review and explicit approval.
BEGIN;

CREATE TABLE public.shop_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('payment_received', 'delivered')),
  recipient_role text NOT NULL CHECK (recipient_role IN ('customer', 'owner')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT shop_notification_outbox_event_recipient_unique UNIQUE (order_id, event_type, recipient_role),
  CONSTRAINT shop_notification_outbox_delivery_customer_only CHECK (event_type <> 'delivered' OR recipient_role = 'customer'),
  CONSTRAINT shop_notification_outbox_sent_timestamp CHECK ((state = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT shop_notification_outbox_lease_consistent CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX shop_notification_outbox_ready_idx
  ON public.shop_notification_outbox (available_at, created_at)
  WHERE state IN ('pending', 'failed');
CREATE INDEX shop_notification_outbox_expired_lease_idx
  ON public.shop_notification_outbox (lease_expires_at)
  WHERE state = 'processing';

ALTER TABLE public.shop_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shop_notification_outbox TO service_role;
CREATE POLICY shop_notification_outbox_service_only
  ON public.shop_notification_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.shop_notification_outbox IS
  'Internal notification ledger. One payment email per recipient role and one final delivered email per order. No automatic PUDO dispatch.';
COMMENT ON COLUMN public.shop_notification_outbox.last_error_code IS
  'Sanitized error code only; never store provider payloads, credentials or customer data.';

COMMIT;
