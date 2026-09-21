-- Clean database script for CampusFind.
-- Wipes all users, items, claims, notifications, and history to start fresh.

TRUNCATE item_history, abuse_reports, notifications, claims, items, users RESTART IDENTITY CASCADE;
