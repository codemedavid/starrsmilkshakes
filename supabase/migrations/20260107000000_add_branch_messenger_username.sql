/*
  # Add Messenger Username to Branches

  Allows each branch to have their own designated Facebook page for Messenger.
  If a branch doesn't have a messenger_username set, the default will be used in the application.

  1. Changes to `branches`
    - Add `messenger_username` (text, nullable) - The Facebook page username for Messenger (without m.me/ prefix)
*/

-- Add messenger_username column to branches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'messenger_username'
  ) THEN
    ALTER TABLE branches ADD COLUMN messenger_username text;
  END IF;
END $$;

-- Add a comment to document the field
COMMENT ON COLUMN branches.messenger_username IS 'Facebook page username for Messenger (e.g., "StarrsFamousShakesMakati"). If null, the default page will be used.';
