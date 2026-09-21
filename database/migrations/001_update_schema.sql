-- Migration script for CampusFind schema updates
-- Run with: psql -h localhost -U campusfind -d campusfind -f migrations/001_update_schema.sql

-- 1. Add handover fields to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS handover_method VARCHAR(100),
ADD COLUMN IF NOT EXISTS handover_note TEXT;

-- 2. Add handover_note to claims table
ALTER TABLE claims 
ADD COLUMN IF NOT EXISTS handover_note TEXT;

-- 3. Add status column to users table (if not exists)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) CHECK (status IN ('ACTIVE', 'BLOCKED')) DEFAULT 'ACTIVE';

-- 4. Simplify items status - update existing data first
-- Map old statuses to new ones: CLAIM_PENDING -> ACTIVE, RESOLVED -> RETURNED, CLOSED -> RETURNED
UPDATE items SET status = 'ACTIVE' WHERE status IN ('CLAIM_PENDING');
UPDATE items SET status = 'RETURNED' WHERE status IN ('RESOLVED', 'CLOSED');

-- Now update the constraint (need to drop and recreate)
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_status_check;
ALTER TABLE items ADD CONSTRAINT items_status_check CHECK (status IN ('ACTIVE', 'RETURNED'));

-- 5. Simplify claims status - remove approval workflow
-- Claims no longer need approval status - they are just submissions
-- Update existing claims to have a simple status
UPDATE claims SET status = 'SUBMITTED' WHERE status IN ('PENDING', 'APPROVED', 'REJECTED');

-- Update claims status constraint
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE claims ADD CONSTRAINT claims_status_check CHECK (status IN ('SUBMITTED'));

-- 6. Add unique constraint on (item_id, claimant_id) for claims
-- This prevents duplicate claims from the same user on the same item
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_item_claimant'
    ) THEN
        ALTER TABLE claims ADD CONSTRAINT unique_item_claimant UNIQUE (item_id, claimant_id);
    END IF;
END $$;

-- 7. Create guidelines table
CREATE TABLE IF NOT EXISTS guidelines (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Create abuse_reports table
CREATE TABLE IF NOT EXISTS abuse_reports (
    id SERIAL PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_id INTEGER REFERENCES claims(id) ON DELETE SET NULL,
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) CHECK (status IN ('OPEN', 'REVIEWED', 'CLOSED')) DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_guidelines_updated ON guidelines(updated_at);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports(status);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_reporter ON abuse_reports(reporter_id);

-- 9. Insert default guidelines
INSERT INTO guidelines (title, content) VALUES
('Meet in Safe Locations', 'Always meet in well-lit, public campus locations during daytime hours. Avoid isolated areas.'),
('Use Campus Communication', 'Use your campus email or official communication channels. Do not share personal phone numbers or social media.'),
('Verify Before Handoff', 'Before handing over an item, verify the claimant can describe specific details about the item that only the owner would know.'),
('No Passwords or PINs', 'Never share device passwords, PINs, or account credentials. Verification should happen through physical inspection during handoff.'),
('High-Value Items', 'For high-value items (laptops, phones, wallets), consider involving campus security for the handoff.'),
('Respect Privacy', 'Do not post sensitive personal information (IDs, passwords, financial info) in item descriptions or claims.'),
('Report Suspicious Activity', 'If a listing or claim seems fraudulent or harassing, use the abuse report feature.'),
('Be Respectful', 'Treat all community members with respect. Harassment or threats will result in account suspension.')
ON CONFLICT DO NOTHING;