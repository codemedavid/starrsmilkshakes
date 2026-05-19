-- Add branch_id to payment_methods so each method can be scoped to a branch.
-- NULL means the payment method is available at ALL branches (global).

ALTER TABLE payment_methods
  ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE CASCADE;

-- Index for efficient per-branch lookups
CREATE INDEX idx_payment_methods_branch ON payment_methods(branch_id);
