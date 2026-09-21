-- Migration 002: Final Repair and Consistency Pass
-- Removes obsolete claim statuses, adds notifications table, and ensures indexes and constraints.

-- 1. Ensure users table has status column
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) CHECK (status IN ('ACTIVE', 'BLOCKED')) DEFAULT 'ACTIVE';

-- 2. Items table: Normalize statuses to ACTIVE or RETURNED
UPDATE items SET status = 'ACTIVE' WHERE status NOT IN ('ACTIVE', 'RETURNED');
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_status_check;
ALTER TABLE items ADD CONSTRAINT items_status_check CHECK (status IN ('ACTIVE', 'RETURNED'));

-- 3. Claims table: Remove obsolete status and updated_at columns if present
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_status_check;
DROP INDEX IF EXISTS idx_claims_status;
ALTER TABLE claims DROP COLUMN IF EXISTS status;
ALTER TABLE claims DROP COLUMN IF EXISTS updated_at;
ALTER TABLE claims ALTER COLUMN message DROP NOT NULL;

-- 4. Claims table: Ensure UNIQUE constraint on (item_id, claimant_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_item_claimant'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'claims_unique_item_claimant'
    ) THEN
        ALTER TABLE claims ADD CONSTRAINT unique_item_claimant UNIQUE (item_id, claimant_id);
    END IF;
END $$;

-- 5. Notifications table: Create if not exists
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    claim_id INTEGER REFERENCES claims(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_claims_item_id ON claims(item_id);
CREATE INDEX IF NOT EXISTS idx_claims_claimant_id ON claims(claimant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
