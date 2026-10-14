# Sync protocol (M4)

How the agent app works offline and catches up later without losing or duplicating tickets
(NFR-01, FR-02, FR-08). The phone is the source of truth for what the agent did; the server is the
source of truth for everything else.

## 1. Principles

- **The phone writes locally first.** Issue, exit + payment, and sign-in all go to SQLite and an
  outbox at once, online or not. The screen never waits for the network.
- **Everything has a client-generated UUID** (ticket, payment, each event). Sending the same item
  twice is harmless: the server answers `duplicate` and changes nothing.
- **Times come from the phone's clock** when the action happened offline (BR-09: system clock,
  never typed). Each push also sends the phone's current time so the server can measure clock skew.
- **Serials come from a pre-allocated block**, so no two phones can ever use the same number.

## 2. Serial blocks

`POST /sync/serial-blocks` → `{ start, end }`

- The server hands this phone the next free block (size from `settings.serialBlockSize`, now 50),
  in one transaction. Blocks never overlap (database constraint, already in place).
- The phone keeps **two** blocks: the one in use and a spare. When the one in use runs out it
  switches to the spare and asks for a new spare at the next sync. That gives 50–100 tickets of
  offline issuing.
- The server refuses a new block if the phone already holds two unused ones (stops hoarding).
- If both blocks run out while offline, the app blocks issuing and asks the agent to get signal.

## 3. Push: phone → server

`POST /sync/push`

```json
{
  "deviceTime": "2026-10-13T02:05:11Z",
  "items": [
    { "kind": "TICKET_ISSUED", "ticket": { "id": "…", "serial": "2538668/MAE/A.M.DILI", "plate": "A-2847-TL",
      "vehicleClassId": "…", "areaId": "…", "entryAt": "…", "tariffCentsPerHour": 50 },
      "event": { "id": "…", "ref": "EVT-2538668-01", "at": "…" } },
    { "kind": "TICKET_CLOSED", "ticketId": "…", "exitAt": "…", "hoursCharged": 2, "amountCents": 100,
      "payment": { "id": "…", "receivedCents": 500, "method": "CASH" },
      "exitEvent": { "id": "…", "ref": "EVT-2538668-02" }, "paymentEvent": { "id": "…", "ref": "EVT-2538668-03" } },
    { "kind": "SIGN_IN", "event": { "id": "…", "at": "…", "details": { "offline": true, "success": true } } }
  ]
}
```

Response: one result per item, same order:
`applied` · `duplicate` · `pending` (try again later) · `rejected` + error code.

The server handles each item in its own transaction, so one bad item never blocks the others.

**Order does not matter.** In each batch the server applies `TICKET_ISSUED` before
`TICKET_CLOSED`. A close for a ticket the server hasn't seen yet gets `pending`; the phone keeps it
in the outbox and sends it again next time.

**What the server checks:**

| Check | If it fails |
| --- | --- |
| Session valid, device not blocked | whole push refused (`401` / `403 DEVICE_BLOCKED`) |
| Serial inside a block given to this phone | `rejected SERIAL_NOT_ALLOCATED` |
| Same id already stored with the same content | `duplicate` |
| Same id or serial with *different* content | `rejected CONFLICT` |
| Ticket already paid by someone else (e.g. a supervisor closed it online) | `rejected ALREADY_PAID`, plus a `CORRECTION` event so a supervisor can see that two people took cash |
| Charge differs from `charging.ts` with the phone's times and tariff | **accepted** (the cash was really taken), and the EXIT event is flagged `chargeMismatch` for review |
| Clock skew over 5 min | accepted, and flagged `clockSkewSeconds` on the events |

The phone deletes an outbox item only after `applied` or `duplicate`. On `rejected`, it marks the
item and shows the agent a message. The data is never silently dropped.

## 4. Pull: server → phone

`GET /sync/pull?since=<cursor>` returns:

- **Reference data**, all of it each time (it is small): the agent's areas, active vehicle classes,
  tariffs, and the `chargingRule` setting, so offline charges use the same rule as the server.
- **Tickets that changed** in the agent's areas since `since`, for example active tickets issued by
  other agents (FR-13) or tickets someone else closed. The phone upserts by id.
- **A new cursor**: the server time. The next pull goes back 60 s from the cursor, so a transaction
  that committed late is never missed. Overlap is harmless because upserts are idempotent.

## 5. Sign-in offline (FR-02, FR-03)

- After an online sign-in the phone keeps, in secure storage (expo-secure-store): the user profile,
  an scrypt hash of the PIN, and the session token.
- Offline sign-in checks the PIN against that hash. Wrong PINs count locally too, and the phone
  locks at `pinMaxAttempts`. Only an online supervisor reset unlocks it.
- Every offline sign-in or failed try is written to the outbox as a `SIGN_IN` event (NFR-07).
- If the token has expired by the time signal returns, the agent signs in online once. The outbox
  is kept and pushed afterwards.

## 6. When sync runs

When the app opens, after each issue or exit, every 2 minutes while the app is open, and when the
network comes back. One sync = push the outbox, then pull, then top up serial blocks if needed.

## Decided (2026-10-14)

1. **Blocked phone (FR-05):** the app locks and signs out, but keeps its encrypted local data so
   unsynced tickets are not lost. A supervisor recovers them from the device later.
2. **Clock skew:** flagged above 5 minutes (`settings.clockSkewWarnSeconds` = 300).
3. **Serial blocks:** each phone holds two blocks of 50, i.e. 50–100 tickets offline.

## Notes for the app (M5)

- Outbox items carry no agent id. They are pushed with the session of the agent who created them.
  If a second agent signs in on the same phone, the first agent's outbox waits for that agent's
  next online sign-in.
- Event references (`EVT-<serial>-<nn>`) are not sent. Phone and server both derive them with
  `ticketEventRef` from `packages/shared`.
- `GET /sync/pull` also returns `closedTicketIds`: tickets in the agent's areas closed by someone
  else, so the parked list stays right without revealing other agents' revenue.
