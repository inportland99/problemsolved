-- =============================================================
-- Coaching Portal: Supabase Setup SQL
-- Run this in the Supabase SQL Editor for the coaching project.
-- This file documents the coaching_clients schema additions used
-- by the client dashboard (values, strengths, goals, special notes).
-- =============================================================

-- Add dashboard columns to coaching_clients.
-- Safe to re-run: each column is added only if it does not exist.
ALTER TABLE coaching_clients
  ADD COLUMN IF NOT EXISTS personal_values text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strengths       text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals           text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS special_notes   text;
