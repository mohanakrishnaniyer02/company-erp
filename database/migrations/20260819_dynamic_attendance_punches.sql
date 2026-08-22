-- Upgrade attendance_entries from a fixed in1/out1..in5/out5 column set to a
-- normalized attendance_punches table (one row per In/Out pair, no fixed cap).
-- Safe to run once against an existing database that still has the in1..out5
-- columns. Existing attendance data is preserved, not lost.

BEGIN;

CREATE TABLE IF NOT EXISTS attendance_punches (
    punch_id       SERIAL PRIMARY KEY,
    attendance_id  INT NOT NULL REFERENCES attendance_entries(attendance_id) ON DELETE CASCADE,
    sequence_no    INT NOT NULL,
    punch_in       TIME,
    punch_out      TIME,
    UNIQUE(attendance_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_attendance_punches_attendance ON attendance_punches(attendance_id);

-- Migrate any existing in1/out1..in5/out5 data into the new table, one row per
-- non-empty pair, only if those legacy columns still exist on this database.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='attendance_entries' AND column_name='in1'
    ) THEN
        INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
        SELECT attendance_id, 1, in1, out1 FROM attendance_entries WHERE in1 IS NOT NULL OR out1 IS NOT NULL
        ON CONFLICT (attendance_id, sequence_no) DO NOTHING;
        INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
        SELECT attendance_id, 2, in2, out2 FROM attendance_entries WHERE in2 IS NOT NULL OR out2 IS NOT NULL
        ON CONFLICT (attendance_id, sequence_no) DO NOTHING;
        INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
        SELECT attendance_id, 3, in3, out3 FROM attendance_entries WHERE in3 IS NOT NULL OR out3 IS NOT NULL
        ON CONFLICT (attendance_id, sequence_no) DO NOTHING;
        INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
        SELECT attendance_id, 4, in4, out4 FROM attendance_entries WHERE in4 IS NOT NULL OR out4 IS NOT NULL
        ON CONFLICT (attendance_id, sequence_no) DO NOTHING;
        INSERT INTO attendance_punches (attendance_id, sequence_no, punch_in, punch_out)
        SELECT attendance_id, 5, in5, out5 FROM attendance_entries WHERE in5 IS NOT NULL OR out5 IS NOT NULL
        ON CONFLICT (attendance_id, sequence_no) DO NOTHING;

        ALTER TABLE attendance_entries
            DROP COLUMN in1, DROP COLUMN out1,
            DROP COLUMN in2, DROP COLUMN out2,
            DROP COLUMN in3, DROP COLUMN out3,
            DROP COLUMN in4, DROP COLUMN out4,
            DROP COLUMN in5, DROP COLUMN out5;
    END IF;
END $$;

COMMIT;
