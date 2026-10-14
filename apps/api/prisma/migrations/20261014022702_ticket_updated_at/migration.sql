-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "tickets_area_id_updated_at_idx" ON "tickets"("area_id", "updated_at");

-- The guard trigger now also stamps updated_at, so sync pull can find changed tickets.
-- Same rules as in 20261014020300_immutability; only the last line before RETURN is new.
CREATE OR REPLACE FUNCTION "guard_ticket_update"() RETURNS trigger
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

  IF (OLD."exit_at" IS NOT NULL AND NEW."exit_at" IS DISTINCT FROM OLD."exit_at")
     OR (OLD."hours_charged" IS NOT NULL AND NEW."hours_charged" IS DISTINCT FROM OLD."hours_charged")
     OR (OLD."amount_cents" IS NOT NULL AND NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents") THEN
    RAISE EXCEPTION 'Exit of ticket % is already recorded', OLD."serial"
      USING ERRCODE = 'restrict_violation';
  END IF;

  NEW."updated_at" := now();
  RETURN NEW;
END;
$$;
