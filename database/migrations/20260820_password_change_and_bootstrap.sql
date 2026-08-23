-- 1. Add must_change_password to users. New rows default to TRUE (every account
--    from here on is created by someone else, via the Employee form or this seed,
--    so it's always someone else's temporary password until they change it).
--    Existing accounts are grandfathered to FALSE since they already picked their
--    own real password through the old signup flow — no need to force them to
--    change something they already chose themselves.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE users SET must_change_password = FALSE;

-- 2. If this database has no SuperAdmin at all yet (e.g. your very first account
--    got created some other way and no longer exists), seed one now so there's
--    always a way in. Safe to run even if one already exists — does nothing then.
INSERT INTO users (full_name, email, password_hash, role, must_change_password)
SELECT 'System Administrator', 'superadmin@company.co',
       '$2b$11$Z9xV0Rh/BjRctSqbT2oEFO1XkR7UbH.2zpk8/TGmom6F/VujYNTX6', 'SuperAdmin', TRUE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'SuperAdmin' AND is_active);
