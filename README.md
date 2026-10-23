# SAMEXA — source package

**Brand:** SAMEXA  
**Tagline:** Your mind. Your mission. Your future.  
**Creator credit:** A vision by Sameeh

This package contains a mobile-first progressive web app (PWA) starter, an owner-only question editor, and a Supabase backend schema for private rooms, password-protected room joining, 1v1 duels, teams, live player updates, and server-checked answer scoring.

## What's included

- `index.html` — SAMEXA visual app UI and countdown to 8 December 2026
- `app.js` — frontend logic, owner sign-in, question editor, room creation/joining and multiplayer UI
- `config.js` — your Supabase project URL + anon key placeholders
- `schema.sql` — tables, Row Level Security, room-password checks, server-side scoring RPCs, and Realtime publication setup
- `manifest.webmanifest`, `service-worker.js`, `icon.svg` — installable app foundation and caching

## Important realities

This is source code, **not a deployed live service**. No public link has been created from this workspace. Real online multiplayer needs a Supabase project and public HTTPS hosting. The browser-only solo quiz works without Supabase; live rooms need database setup.

The owner can update the shared tagline and countdown date in Owner Studio; those settings are stored in the database. Use the public URL for players and the same URL plus `?owner=1` for the owner sign-in route (the query string is only a shortcut, not security). The brand mark itself is SAMEXA. The PWA is not a native Play Store app. When published through HTTPS, Android browsers can offer **Install app / Add to Home screen**. Service-worker and manifest rules mean opening `index.html` as a local file will not install the app.

## Publish it

1. Create a Supabase project.
2. In Supabase Authentication settings, enable **Anonymous Sign-Ins** so visitors can play with a nickname. Add abuse protection / CAPTCHA or Turnstile and sensible rate limits before sharing widely; anonymous identities persist in the browser but are not portable between devices. See the official guide: https://supabase.com/docs/guides/auth/auth-anonymous
3. Create a separate email/password auth user for yourself. Do not share this owner login with players.
4. Open the Supabase SQL Editor and run `schema.sql`.
5. Copy the project URL and **anon/publishable key** into `config.js`. Never put the `service_role` key in the frontend.
6. In Supabase SQL Editor, find your owner user's UUID in Authentication → Users and run the final `INSERT` template at the bottom of `schema.sql` with that UUID. Only that account should be added to `public.app_admins`.
7. Upload the files together to an HTTPS static host (for example, Netlify, Vercel or Cloudflare Pages). Use the folder as the deployment root. The project needs `index.html`, `app.js`, `config.js`, `manifest.webmanifest`, `service-worker.js` and `icon.svg` at the same path.
8. Visit the deployed HTTPS URL on Android Chrome → menu ⋮ → **Install app** or **Add to Home screen**.
9. Test in two separate browsers/devices: create a room on one, share the room code and password, join from the other, create teams if using Teams, then start the game.

## Owner-only editing

Use the public app link for players. Your owner entry link can be the same domain with `?owner=1` (for example `https://your-domain.example/?owner=1`); it opens the owner sign-in prompt, but it is not a secret link. The account login + database RLS is the actual protection. You can also click **Owner** in the top navigation. Sign in with your own Supabase email/password account. The app calls `is_app_admin()`; shared database writes are restricted by RLS and admin policies. A visitor or player account does not get editor permissions just by knowing the site URL.

Do not expose your owner password, Supabase service-role key, or hosting deployment token. The public site link is for players; your owner identity is validated by Supabase.

## Room rules

- **1v1 duel:** room can contain at most two players.
- **Team battle:** players can create or choose teams while the room is in the lobby.
- **Room password:** stored as a password hash server-side; joining uses the room code and password.
- **Scoring:** `submit_game_answer` checks the answer key in PostgreSQL and stores one answer per player/question. The correct answer key is not included in the public question-bank table.
- **Realtime:** room state, players and teams update using Supabase Realtime table changes.

## Current content limitation

The question examples in the solo mode are clearly demonstrations. The database begins with no official textbook-derived question bank. Upload the actual Sri Lankan government Business & Accounting Studies / Commerce textbook, past papers and marking schemes, then curate the content in Owner Studio. Only mark a question **Verified official** when the original source has actually been checked. This project does not claim to contain all official papers.

## Privacy

The app uses a chosen display nickname for multiplayer and anonymous Supabase Auth for guest sessions. It does not secretly collect players' names, phone numbers or email addresses. If you add registration/analytics later, give visitors clear notice and collect only what is necessary. Use provider analytics or a privacy notice for aggregated traffic reports; do not promise that IP-address analytics are anonymous.


## Optional learner profiles and visitor analytics

The optional profile form asks the learner to choose a display name and explicitly consent before saving it. Contact is optional; details are displayed in Owner Studio only for learners who submitted the consent form. Visitors who do not register can still play using a nickname. The backend records aggregate page-visit events per authenticated browser session so the owner can understand overall traffic. Do not use analytics to secretly identify people.
