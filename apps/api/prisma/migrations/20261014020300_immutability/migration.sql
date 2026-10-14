-- Database-level guarantees. These hold even if application code is wrong or someone connects
-- directly with SQL (CLAUDE.md rules 1, 4, 5; FR-26, NFR-07, BR-05–07).
--
-- NOTE: a table owner can still disable triggers. In production the API must connect as a role
-- that does NOT own these tables (see M8 security review).

-- ── Check constraints ───────────────────────────────────────────────────────

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_money_non_negative"
    CHECK ("tariff_cents_per_hour" >= 0 AND ("amount_cents" IS NULL OR "amount_cents" >= 0)),
  ADD CONSTRAINT "tickets_hours_positive"
    CHECK ("hours_charged" IS NULL OR "hours_charged" >= 1),
  ADD CONSTRAINT "tickets_exit_after_entry"
    CHECK ("exit_at" IS NULL OR "exit_at" >= "entry_at"),
  ADD CONSTRAINT "tickets_paid_is_complete"
    CHECK ("status" <> 'PAGO' OR ("exit_at" IS NOT NULL AND "hours_charged" IS NOT NULL AND "amount_cents" IS NOT NULL)),
  ADD CONSTRAINT "tickets_plate_upper_case"
    CHECK ("plate" = upper("plate") AND length(btrim("plate")) > 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount_cents" >= 0);

ALTER TABLE "tariffs"
  ADD CONSTRAINT "tariffs_cents_non_negative" CHECK ("cents_per_hour" >= 0),
  ADD CONSTRAINT "tariffs_period_valid"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

ALTER TABLE "serial_blocks"
  ADD CONSTRAINT "serial_blocks_range_valid" CHECK ("start" >= 1 AND "start" <= "end"),
  ADD CONSTRAINT "serial_blocks_no_overlap"
    EXCLUDE USING gist (int4range("start", "end", '[]') WITH &&);

ALTER TABLE "devices"
  ADD CONSTRAINT "devices_serial_block_valid"
    CHECK (("serial_block_start" IS NULL) = ("serial_block_end" IS NULL)
       AND ("serial_block_start" IS NULL OR "serial_block_start" <= "serial_block_end"));

-- ── Append-only tables: events and payments ─────────────────────────────────

CREATE FUNCTION "reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: the table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "events_append_only"
  BEFORE UPDATE OR DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "events_no_truncate"
  BEFORE TRUNCATE ON "events"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "payments_append_only"
  BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "payments_no_truncate"
  BEFORE TRUNCATE ON "payments"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- ── Tickets: never deleted; Ativo → Pago only; issue data never changes ─────

CREATE FUNCTION "guard_ticket_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PAGO' THEN
    RAISE EXCEPTION 'Ticket % is paid and cannot be changed', OLD."serial"
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."serial" IS DISTINCT FROM OLD."serial"
     OR NEW."plate" IS DISTINCT FROM OLD."plate"
     OR NEW."vehicle_class_id" IS DISTINCT FROM OLD."vehicle_class_id"
     OR NEW."area_id" IS DISTINCT FROM OLD."area_id"
     OR NEW."agent_id" IS DISTINCT FROM OLD."agent_id"
     OR NEW."device_id" IS DISTINCT FROM OLD."device_id"
     OR NEW."entry_at" IS DISTINCT FROM OLD."entry_at"
     OR NEW."tariff_cents_per_hour" IS DISTINCT FROM OLD."tariff_cents_per_hour"
     OR NEW."received_at" IS DISTINCT FROM OLD."received_at" THEN
    RAISE EXCEPTION 'Issue data of ticket % cannot be changed; record a CORRECTION event instead', OLD."serial"
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Once recorded, the exit and charge are final.
  IF (OLD."exit_at" IS NOT NULL AND NEW."exit_at" IS DISTINCT FROM OLD."exit_at")
     OR (OLD."hours_charged" IS NOT NULL AND NEW."hours_charged" IS DISTINCT FROM OLD."hours_charged")
     OR (OLD."amount_cents" IS NOT NULL AND NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents") THEN
    RAISE EXCEPTION 'Exit of ticket % is already recorded', OLD."serial"
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "tickets_guard_update"
  BEFORE UPDATE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION "guard_ticket_update"();
CREATE TRIGGER "tickets_no_delete"
  BEFORE DELETE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "tickets_no_truncate"
  BEFORE TRUNCATE ON "tickets"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- ── Tariffs: history is kept; a period can only be closed (FR-28, BR-04) ────

CREATE FUNCTION "guard_tariff_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."valid_until" IS NOT NULL
     OR NEW."valid_until" IS NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."vehicle_class_id" IS DISTINCT FROM OLD."vehicle_class_id"
     OR NEW."cents_per_hour" IS DISTINCT FROM OLD."cents_per_hour"
     OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
     OR NEW."changed_by" IS DISTINCT FROM OLD."changed_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'A tariff can only be closed by setting valid_until once; add a new tariff instead'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tariffs_guard_update"
  BEFORE UPDATE ON "tariffs"
  FOR EACH ROW EXECUTE FUNCTION "guard_tariff_update"();
CREATE TRIGGER "tariffs_no_delete"
  BEFORE DELETE ON "tariffs"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "tariffs_no_truncate"
  BEFORE TRUNCATE ON "tariffs"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
