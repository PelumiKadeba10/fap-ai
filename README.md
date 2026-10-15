# FAP AI

Surplus food recovery and redistribution for the Feed-a-Person Initiative (Covenant University).
Live target: **Convocation, 30 October 2026**.

One Next.js app, deployed on Vercel, with Supabase for the database, sign-in and realtime updates.

| Who | Where | What they do |
|---|---|---|
| Coordinators (signed in) | `/event`, `/intake`, `/match`, `/live`, `/impact` | Plan the event, log food, match it to sites, assign volunteers, watch deliveries |
| Volunteers (no sign-in) | `/v/<secret-link>` | See their delivery and tap Picked up / On the way / Delayed / Delivered |

## Set up (about 15 minutes)

1. **Install:** `npm install`
2. **Run:** `npm run dev` → http://localhost:3000 → sign in.
3. **Test the logic:** `npm test` (8 tests: prediction, urgency, matching, parser, time zone, status flow).


## How a night runs

1. **Event & surplus:** create the event (students, start, duration). Shows expected surplus and when to have volunteers ready.
2. **Food intake:** paste a volunteer's message → Claude reads it → check the record → Save batch. Without an API key, an offline parser is used.
3. **Match & route:** keep the sites list up to date → Run matching → Approve plan. This creates the deliveries.
4. **Live dispatch:** pick a volunteer for each delivery → tap **WhatsApp** to send them their link. Their taps update the board instantly. Rows turn red when delayed or within 20 minutes of the safe time. Coordinators can also update a status on a volunteer's behalf.
5. **Impact report:** fills in from the records.

## Code map

```
app/(admin)/        coordinator screens + actions.ts (all writes go through server actions)
app/v/[token]/      volunteer page (works without JavaScript)
app/api/parse/      message → record with the Claude API, offline fallback
lib/                pure logic shared by both sides: predict, urgency, match, status, parse-local, format
lib/supabase/       server, browser and service-role clients
supabase/           schema migration and seed data
tests/              logic tests (npm test)
```

## Rules of thumb

- Times are stored in UTC and shown in Lagos time (`lib/format.ts`).
- The surplus rate for Convocation (40%) and the food safe windows live in `lib/predict.ts` and `lib/urgency.ts`. Change them there, then run `npm test`.
- The service role key is only used in `app/v/[token]/` after checking the secret token. Never import `lib/supabase/admin.ts` from a client component.
- Work on a branch, open a pull request into `main`.
