# Dayflow

A minimalist, mobile-first personal planner in Hebrew (RTL). Plans are organised by
**parts of the day** (morning, late morning, noon, afternoon, evening, night) rather than
exact hours. Exact times, all-day items, multi-day ranges and repeats are optional.

- **Day / week / month** views with a shared selected date, swipe between days on mobile
- **Activities** (planned time) and **tasks** (things to get done) kept visually distinct
- Categories with soft colours, light/dark themes, installable PWA
- Closed app: username + password login, data in Supabase protected by RLS

## Stack

Plain HTML/CSS and native ES modules: no build step and no runtime dependencies besides
[`@supabase/supabase-js`](https://github.com/supabase/supabase-js), loaded from jsDelivr and
cached by the service worker.

```
index.html, manifest.webmanifest, sw.js   app shell + PWA
css/app.css                               design tokens, themes, layout
js/app.js                                 entry: backend choice, rendering, swipe, shortcuts
js/data/store.js                          state + optimistic actions with rollback
js/data/backend-supabase.js               Supabase implementation
js/data/backend-mock.js                   in-browser mock (local dev / UI tests only)
js/lib/{dates,periods,recurrence}.js      pure logic (unit tested)
js/ui/{views,forms,fields,overlay}.js     screens, sheets, controls
supabase/migrations/                      database schema (applied to the project)
tests/                                    unit tests (node:test) + end-to-end UI test
```

## Run locally

```bash
python3 -m http.server 5173        # or: npm start
```

- `http://localhost:5173/` uses the real Supabase backend.
- `http://localhost:5173/?mock` uses an in-browser mock backend (localhost only).
  Demo login: `demo` / `demo1234`.

## Checks

```bash
npm install            # TypeScript, used only for type checking the JS (JSDoc)
npm run typecheck
npm test               # unit tests: dates, recurrence, store (optimistic updates, rollback, …)

# End-to-end UI test (Playwright for Python + Chrome), against the mock backend:
python3 -m http.server 5173 --bind 127.0.0.1 &
python3 tests/e2e.py --shots screenshots
```

## Deploy (GitHub Pages)

The site is static. In the repository settings: **Pages → Build and deployment → Deploy from a
branch → `main` / root**. The app is then served at `https://<user>.github.io/<repo>/`.
All paths are relative, so any sub-path works.

After changing files listed in `sw.js`, bump `VERSION` in `sw.js` so installed copies update.

### iPhone

Open the site in Safari → Share → **Add to Home Screen**. It opens full-screen like an app.

## Database

Tables (all prefixed `df_`, living alongside other apps in the same Supabase project):

| table | purpose |
|---|---|
| `df_members` | allowlist: which auth users may use Dayflow (+ username) |
| `df_profiles` | per-user settings (theme) |
| `df_categories` | user categories (name, colour, order) |
| `df_activities` | activities: date / end date, period, optional times, all-day, colour, location, priority, completion, repeat rule |
| `df_occurrence_overrides` | per-date state of a recurring activity (done / removed) |
| `df_tasks` | tasks: due date, optional scheduling into a day + period, priority, completion |

Security: RLS on every table. A row is visible/writable only when `user_id = auth.uid()` **and**
the user is in `df_members`, so other accounts in the shared project (or self sign-ups) see
nothing. `anon` has no privileges. Composite foreign keys `(category_id, user_id)` stop a row
from pointing at another user's category. CHECK constraints validate periods, dates and times.

### Users

Login is username + password. Usernames map to a synthetic auth e-mail
(`u-<hex of the UTF-8 username>@users.dayflow.local`). To add a user, run
`supabase/create-user.sql` in the Supabase SQL editor with the new username and password.
Users can change their password in **הגדרות → החלפת סיסמה**.

## Known limitations

- Reminders/notifications are not implemented (needs Web Push + a scheduled sender).
- Monthly repeats on the 29th–31st skip months that don't have that day.
- Recurring activities can't also span several days.
