# Supabase setup

The app code is configured for Supabase Auth, per-user Row Level Security, and offline-first garage sync. Complete these dashboard steps once for the connected Supabase project.

## 1. Apply the database migration

The Supabase CLI is installed locally in this project. From the repository root, run:

```powershell
npm run supabase:login
npm run supabase:link
npm run db:push:dry
npm run db:push
```

`supabase:link` asks for the hosted project's database password. Get or reset it from Supabase Dashboard → Project Settings → Database. Do not put that password in `.env` or commit it.

The dry run shows pending migrations without changing the remote database. The final command applies:

`supabase/migrations/202608130001_vehicle_garages.sql`

Alternatively, open Supabase Dashboard → SQL Editor and run the contents of that file manually.

It creates:

- `profiles` and `garages` tables;
- owner-only RLS policies;
- the profile creation trigger;
- the conflict-safe `sync_garage` RPC used by the offline queue.

Never put the Supabase `service_role` key in this mobile app.

## 2. Configure app redirects

In Authentication → URL Configuration → Redirect URLs, add:

```text
vehicleservicelog://**
```

The app uses `vehicleservicelog://auth/callback` for OAuth, signup confirmation, and password recovery.

## 3. Enable email/password

In Authentication → Providers → Email:

- enable Email provider;
- choose whether signup email confirmation is required;
- configure SMTP before production so confirmation/reset emails are reliable.

## 4. Enable Google

Create a Google OAuth Web application and configure the Google provider in Supabase. The provider callback URL is:

```text
https://kzyrhmbmbzcvyclgvwdi.supabase.co/auth/v1/callback
```

Put the Google Client ID and Client Secret only in the Supabase dashboard, not in the app.

## 5. Enable Facebook

Create a Facebook app, enable Facebook Login, and add the same Supabase callback URL under Valid OAuth Redirect URIs:

```text
https://kzyrhmbmbzcvyclgvwdi.supabase.co/auth/v1/callback
```

Enable both `public_profile` and `email`. While the Facebook app is in Development mode, only users assigned an app role can sign in.

## 6. Configure build environments

Local development reads `.env`. For EAS Workflows, add these as **plaintext** variables to both the `preview` and `production` EAS environments:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

For a legacy Supabase key, use `EXPO_PUBLIC_SUPABASE_ANON_KEY` instead of the publishable-key variable. These are client-visible values protected by RLS; never use a database password or `service_role` key.

## Offline behavior

- A valid Supabase session is persisted on device.
- Every garage change is written to a user-scoped local cache first.
- Unsynced changes remain queued after app restarts.
- Reconnecting triggers automatic upload.
- Newer remote data is downloaded automatically.
- The Home header and Options sheet show `Synced`, `Syncing`, `Pending`, `Offline`, or `Retry sync`.
