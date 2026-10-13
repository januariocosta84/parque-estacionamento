# Prompts for Claude Code

Open a terminal in this folder, run `claude`, then paste these one at a time.
Wait for each to finish, check the result, and commit before moving on.

---

**1. Plan first**

> Read CLAUDE.md and everything in docs/, and look at the PNGs in docs/screens. Then propose the folder structure and the Prisma schema for the whole system. Don't write code yet. List anything in the requirements you think is unclear.

**2. Scaffold (M0)**

> Do milestone M0 from docs/PLAN.md. Set up the monorepo exactly as CLAUDE.md describes, make `pnpm dev`, `pnpm lint`, `pnpm typecheck` and `pnpm test` work, and add a README with setup steps.

**3. Domain core (M1)**

> Do M1. Write charging.ts test-first: cover 0 min, 1 min, 59 min, 60 min, 61 min, 1 h 45 min, 12 h, and a tariff change between entry and exit (BR-04). Money in integer cents only.

**4. Database and API base (M2)**

> Do M2. Include a PostgreSQL trigger that blocks UPDATE and DELETE on the events table, and a test proving it. Seed data must not invent tariffs for cars or heavy vehicles — seed them inactive with a TODO.

**5. Ticket API (M3)** → **6. Sync API (M4)**

> Do M3. … / Do M4. Show me the sync protocol in a short doc before implementing it.

**7. Agent app (M5, M6)**

> Do M5. Then do M6 one screen at a time, matching docs/screens/0X-….png. Use the colour tokens in docs/DESIGN.md.

**8. Console (M7)** → **9. Pilot hardening (M8)**

> Do M7, starting with sign-in and Monitorização to match 07-console-monitorizacao.png. / Do M8.

---

Tips

- If Claude Code starts guessing a tariff or rule marked "to confirm", stop it and decide yourself.
- Ask it to run the tests after every change.
- Use `/clear` between milestones to keep its context focused; CLAUDE.md is re-read automatically.
