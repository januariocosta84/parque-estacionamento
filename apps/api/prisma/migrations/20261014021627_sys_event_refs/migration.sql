-- AlterTable
ALTER TABLE "events" ALTER COLUMN "ref" SET DEFAULT ('SYS-'::text || lpad((nextval('event_ref_seq'::regclass))::text, 7, '0'::text));
