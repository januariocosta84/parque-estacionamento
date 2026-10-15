# Decisions

Answers to open questions, so they are not asked or guessed again. Newest last.

| Date | Question | Decision |
| --- | --- | --- |
| 2026-10-14 | Serial format: CLAUDE.md `NNNNNNN/MAE/A.M.DILI` or the screens' `DL-26-00148`? | `NNNNNNN/MAE/A.M.DILI`, continuing after 2538667. The screens show demo data. |
| 2026-10-14 | Event reference and receipt number format (must work offline) | Based on the ticket serial: `EVT-2538668-01` issue, `-02` exit, `-03` payment, `-04`… later events on that ticket; receipt `REC-2538668`. Events with no ticket (sign-in, admin changes) get a server number `SYS-0000001`. |
| 2026-10-14 | What does a supervisor's "record exit" (FR-23) do? | Exit and cash payment in one step, the same as the agent's "Confirmar saída e pagamento". The ticket goes straight to Pago. |
| 2026-10-14 | Platforms | Agent app ships as an Android APK **and** for iOS (EAS builds). |
| 2026-10-14 | Blocked phone: wipe local data? | No. Lock the app and sign out, keep the encrypted data so unsynced tickets can be recovered. |
| 2026-10-14 | Clock skew limit | Flag events from a phone whose clock is over 5 minutes off (`clockSkewWarnSeconds` = 300). |
| 2026-10-14 | Offline capacity | Two serial blocks of 50 per phone (50–100 tickets without signal). |
| 2026-10-15 | SMS provider for console sign-in codes (FR-04) | **Fonnte**, a WhatsApp gateway: codes arrive as WhatsApp messages, so console users need WhatsApp on their phone number. Token in the server environment only. |

## Defaults chosen in code, to confirm with AMD

All are in the `settings` table and can change without a release.

| Setting | Default | Requirement |
| --- | --- | --- |
| `chargingRule` | minimum 1 h, grace 0 min (each started hour is a full hour) | BR-02, BR-03 (to confirm) |
| `pinMaxAttempts` | 5 | FR-03 does not give a number |
| `agentSessionHours` / `consoleSessionHours` | 24 / 8 | — |
| `serialBlockSize` | 50 | CLAUDE.md rule 7 |
