ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'unpaid',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
