-- Fix for existing ERP databases created before the new Shift master.
--
-- The previous upgrade added the new columns (shift_start_time, ...)
-- but the old columns (start_time, end_time, ...) remained NOT NULL.
-- New Shift inserts therefore populated the new columns but left the old
-- NOT NULL columns empty, causing PostgreSQL error 23502.
--
-- This script preserves the existing data by making the original legacy
-- columns the canonical columns expected by the new API, and removes the
-- duplicate columns created by the first migration.
--
-- Safe to run once against the existing ERP database.

BEGIN;

-- Start time
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='start_time'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='shift_start_time'
    ) THEN
        UPDATE shift_templates
        SET shift_start_time = COALESCE(shift_start_time, start_time);
        ALTER TABLE shift_templates DROP COLUMN shift_start_time;
        ALTER TABLE shift_templates RENAME COLUMN start_time TO shift_start_time;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='start_time'
    ) THEN
        ALTER TABLE shift_templates RENAME COLUMN start_time TO shift_start_time;
    END IF;
END $$;

-- End time
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='end_time'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='shift_end_time'
    ) THEN
        UPDATE shift_templates
        SET shift_end_time = COALESCE(shift_end_time, end_time);
        ALTER TABLE shift_templates DROP COLUMN shift_end_time;
        ALTER TABLE shift_templates RENAME COLUMN end_time TO shift_end_time;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='end_time'
    ) THEN
        ALTER TABLE shift_templates RENAME COLUMN end_time TO shift_end_time;
    END IF;
END $$;

-- Lunch start
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='lunch_start'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='lunch_start_time'
    ) THEN
        UPDATE shift_templates
        SET lunch_start_time = COALESCE(lunch_start_time, lunch_start);
        ALTER TABLE shift_templates DROP COLUMN lunch_start_time;
        ALTER TABLE shift_templates RENAME COLUMN lunch_start TO lunch_start_time;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='lunch_start'
    ) THEN
        ALTER TABLE shift_templates RENAME COLUMN lunch_start TO lunch_start_time;
    END IF;
END $$;

-- Lunch end
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='lunch_end'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='lunch_end_time'
    ) THEN
        UPDATE shift_templates
        SET lunch_end_time = COALESCE(lunch_end_time, lunch_end);
        ALTER TABLE shift_templates DROP COLUMN lunch_end_time;
        ALTER TABLE shift_templates RENAME COLUMN lunch_end TO lunch_end_time;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='lunch_end'
    ) THEN
        ALTER TABLE shift_templates RENAME COLUMN lunch_end TO lunch_end_time;
    END IF;
END $$;

-- Night-shift flag
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='is_next_day'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='is_night_shift'
    ) THEN
        UPDATE shift_templates
        SET is_night_shift = COALESCE(is_night_shift, is_next_day);
        ALTER TABLE shift_templates DROP COLUMN is_night_shift;
        ALTER TABLE shift_templates RENAME COLUMN is_next_day TO is_night_shift;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='shift_templates' AND column_name='is_next_day'
    ) THEN
        ALTER TABLE shift_templates RENAME COLUMN is_next_day TO is_night_shift;
    END IF;
END $$;

-- Make the canonical time fields explicitly NOT NULL, matching the API model.
ALTER TABLE shift_templates
    ALTER COLUMN shift_start_time SET NOT NULL,
    ALTER COLUMN shift_end_time SET NOT NULL;

COMMIT;
