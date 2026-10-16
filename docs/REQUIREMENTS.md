# Requirements — Estacionamento Dili

Source: System Requirements Specification (draft, October 2026). Priority: **M** = Must (Release 1 unless noted), **S** = Should.
**R1** = Release 1 (week 10), **R2** = Release 2 (by month 4).

## Roles

| Role       | Tool      | May do                                                                                               | May not do                                               |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| agent      | Phone app | Issue tickets, record exits and payments, print/send copies, see own tickets                         | See others' revenue, change tariffs, edit closed tickets |
| supervisor | Console   | See tickets and revenue for assigned areas, record an exit, reset PIN, block a device, handle alerts | Change tariffs, delete records                           |
| finance    | Console   | View and export revenue reports                                                                      | Change tickets                                           |
| auditor    | Console   | View and export the event log                                                                        | Change anything                                          |
| admin      | Console   | Manage accounts, areas, vehicle classes, tariffs                                                     | Delete tickets or events                                 |

## Functional requirements

| ID    | Requirement                                                                                                                   | Pri | Release                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------- |
| FR-01 | Agent signs in on the phone with agent number (e.g. AMD-017) and 6-digit PIN                                                  | M   | R1                                                                |
| FR-02 | Agent can sign in without a signal using the last successful sign-in saved on that phone                                      | M   | R1                                                                |
| FR-03 | Lock agent account after repeated wrong PINs until a supervisor resets it                                                     | M   | R1                                                                |
| FR-04 | Console users sign in with username, password and one-time SMS code                                                           | M   | R1 (SMS code may use a dev stub until the SMS provider is chosen) |
| FR-05 | Supervisor can block a lost/stolen device                                                                                     | S   | R1                                                                |
| FR-06 | Issue a ticket from plate number + vehicle class                                                                              | M   | R1                                                                |
| FR-07 | Serial, date, entry time, agent and area added automatically; agent cannot type them                                          | M   | R1                                                                |
| FR-08 | Unique serial numbers, also offline                                                                                           | M   | R1                                                                |
| FR-09 | Warn if the same plate already has an active ticket                                                                           | S   | R2                                                                |
| FR-10 | Create white, yellow and red copies at issue                                                                                  | M   | R1                                                                |
| FR-11 | Send white copy to driver by SMS if a phone number is given                                                                   | S   | R2                                                                |
| FR-12 | Print ticket on a portable Bluetooth thermal printer                                                                          | S   | R2                                                                |
| FR-13 | Find an active ticket by plate, serial, or the parked list                                                                    | M   | R1                                                                |
| FR-14 | Record exit time automatically; show time parked, hours charged, tariff, total before payment                                 | M   | R1                                                                |
| FR-15 | Record payment method (cash only in R1) and amount received                                                                   | M   | R1                                                                |
| FR-16 | Issue receipt: serial, plate, entry/exit, hours, amount, agent, event reference                                               | M   | R1                                                                |
| FR-17 | Close ticket on payment; it can never be used again                                                                           | M   | R1                                                                |
| FR-18 | Agent's tickets for the day: filters All/Ativos/Pagos, search by plate or serial                                              | M   | R1                                                                |
| FR-19 | Agent's own count of parked vehicles and money received today                                                                 | M   | R1                                                                |
| FR-20 | Console: vehicles parked, money received, tickets issued, exits — refreshed at least every minute                             | M   | R1                                                                |
| FR-21 | Filter every console view by area, date and agent                                                                             | M   | R1                                                                |
| FR-22 | Entries, exits and revenue by hour of day                                                                                     | S   | R2                                                                |
| FR-23 | Active tickets with duration, oldest first; supervisor can record an exit                                                     | S   | R1                                                                |
| FR-24 | Alerts for stays over a set limit and failed prints/messages                                                                  | S   | R2                                                                |
| FR-25 | Daily revenue report per agent and per area                                                                                   | M   | R1                                                                |
| FR-26 | Event log that no user can edit or delete                                                                                     | M   | R1                                                                |
| FR-27 | Export reports and event log to .xlsx/.csv and PDF                                                                            | S   | R2                                                                |
| FR-28 | Admin manages accounts, roles, areas, vehicle classes, tariffs; every change logged; tariff changes apply only to new tickets | M   | R1                                                                |
| FR-29 | Read the plate with the phone camera, on the phone and offline; the agent confirms it; the photo is not kept                  | S   | R2 (added 2026-10-16, see DECISIONS.md)                           |

## Business rules

| ID    | Rule                                                                                        |
| ----- | ------------------------------------------------------------------------------------------- |
| BR-01 | Charged per hour, US dollars, by vehicle class                                              |
| BR-02 | Minimum charge one hour                                                                     |
| BR-03 | Each started hour = full hour (1 h 45 min → 2 h). _To confirm with AMD — keep configurable_ |
| BR-04 | Total = hours charged × tariff in force when the ticket was issued                          |
| BR-05 | States: Ativo → Pago only                                                                   |
| BR-06 | Valid for one use; never reopened                                                           |
| BR-07 | Nothing deleted; corrections are logged events with user and reason                         |
| BR-08 | Copies: white = owner, yellow = AMD Finance, red = audit                                    |
| BR-09 | Entry and exit times from the system clock                                                  |

Tariffs (seed data): Motorizadas 50 cents/h (from paper ticket). Veículos ligeiros, Pesados — semi-reboque, Pesados — mercadorias: **to confirm** (seed as inactive placeholders; prototype used 100 cents/h for cars as demo only).

## Data

| Record       | Key fields                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket       | id (uuid), serial, plate, vehicleClassId, areaId, agentId, deviceId, entryAt, exitAt, hoursCharged, tariffCentsPerHour, amountCents, status (ATIVO/PAGO), driverPhone? |
| Payment      | id, ticketId, receiptNo, amountCents, method (CASH), receivedAt, agentId                                                                                               |
| Event        | id (uuid), ref (e.g. EVT-00148-03), type (ISSUE, EXIT, PAYMENT, PRINT, SMS, CORRECTION, SIGN_IN, ADMIN_CHANGE), at, userId, deviceId, ticketId?, details (json)        |
| User         | id, name, agentNumber or username, role, areaIds, status (ACTIVE/LOCKED), phone, pinHash/passwordHash                                                                  |
| Device       | id, userId?, status (ACTIVE/BLOCKED), serialBlockStart, serialBlockEnd, lastSyncAt                                                                                     |
| Area         | id, name (e.g. Setor A), active                                                                                                                                        |
| VehicleClass | id, code, namePt, nameTet, active                                                                                                                                      |
| Tariff       | id, vehicleClassId, centsPerHour, validFrom, validUntil?, changedBy                                                                                                    |

## Non-functional

| ID     | Requirement                                                                   |
| ------ | ----------------------------------------------------------------------------- |
| NFR-01 | Agent app works fully offline; syncs later with no lost or duplicated tickets |
| NFR-02 | Low-cost Android phones (Android 9+), readable in sunlight                    |
| NFR-03 | Issue a ticket in under 30 s from opening the app                             |
| NFR-04 | Touch targets ≥ 44 px                                                         |
| NFR-05 | Portuguese and Tetum                                                          |
| NFR-06 | Encrypted on device and in transit; role checks on server                     |
| NFR-07 | Every sign-in and change logged with user, time, device                       |
| NFR-08 | 99% availability in operating hours                                           |
| NFR-09 | Daily backups; restore within one working day                                 |
| NFR-10 | Retention period set by AMD (configurable)                                    |
| NFR-11 | Console works in current Chrome, Edge, Firefox and on tablets                 |
