-- When a cancelled subscription stops (Stripe's cancel_at, or the period end when it cancels at
-- period end). The plan stays paid until then; Billing shows the date. NULL = renews.
ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;
