-- Fix loyalty enum mismatches between DB and application code

-- Add 'registration' and 'card_view' to session purpose
ALTER TYPE public.loyalty_session_purpose ADD VALUE IF NOT EXISTS 'registration';
ALTER TYPE public.loyalty_session_purpose ADD VALUE IF NOT EXISTS 'card_view';

-- Add 'earn' to transaction type (combined stamp+point earn)
ALTER TYPE public.loyalty_transaction_type ADD VALUE IF NOT EXISTS 'earn';
