# Authentication and authorization

## Account model
- Application login roles are **HR**, **Admin**, and **SuperAdmin** only.
- Employee `RoleType` is a separate employee-master field and does not grant application login access.
- Passwords are stored only as BCrypt hashes.

## Signup / provisioning
- There is no normal public signup after setup.
- On a fresh database with zero users, the login screen exposes **Initial setup** to create exactly one SuperAdmin.
- After the first account exists, that option disappears.
- Admin and SuperAdmin create later accounts from **User Access** inside the application.
- Admin can create HR accounts; SuperAdmin can create HR, Admin and SuperAdmin accounts.

## JWT model
A JWT is an **access token**, not a user password or a permanent account credential. The API therefore does **not** generate/store a JWT as part of ordinary account creation. When a user successfully logs in, the server verifies the BCrypt password hash and then generates a fresh, signed, short-lived JWT. The React client stores that access token in localStorage and sends it in the Authorization header for API calls.

This is safer than reusing one JWT created when an account was provisioned because JWTs expire and are bearer credentials. Reusing a stored JWT would make password changes, forced logout, and expiry handling much harder.

## What happens when a user is added
1. Admin/SuperAdmin enters the person's name, email, temporary password, and role.
2. Server hashes the password with BCrypt and stores the account.
3. No access token is returned to the administrator.
4. The new user signs in with email + password.
5. The server returns a fresh JWT for that session.
6. Only HR/Admin/SuperAdmin can pass the login authorization check.

## Database migration
For existing databases, run:
`database/migrations/20260822_auth_access_roles.sql`

It clears legacy `users.jwt_token` values. The column remains only for backward compatibility and is no longer used by the application.
