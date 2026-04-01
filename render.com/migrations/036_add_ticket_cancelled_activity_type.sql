-- Migration: Add TICKET_CANCELLED to customer_activities activity_type constraint
-- Date: 2026-04-01
-- Description: Allow TICKET_CANCELLED activity type for logging ticket cancellations

-- Drop old constraint
ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_activity_type_check;

-- Add new constraint with TICKET_CANCELLED
ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_activity_type_check
CHECK (activity_type IN (
    'WALLET_DEPOSIT',
    'WALLET_WITHDRAW',
    'WALLET_VIRTUAL_CREDIT',
    'WALLET_REFUND',
    'TICKET_CREATED',
    'TICKET_UPDATED',
    'TICKET_COMPLETED',
    'TICKET_DELETED',
    'TICKET_CANCELLED',
    'ORDER_CREATED',
    'ORDER_CANCELLED',
    'ORDER_DELIVERED',
    'ORDER_RETURNED',
    'MESSAGE_SENT',
    'MESSAGE_RECEIVED',
    'PROFILE_UPDATED',
    'TAG_ADDED',
    'NOTE_ADDED'
));
