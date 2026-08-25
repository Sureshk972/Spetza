-- "Nobody home" becomes a decision the sender makes before pickup, not one
-- the courier improvises on a doorstep.
--
-- The sender picks, at posting time, whether a package may be left at the
-- door or must come back. A returned delivery is its own terminal outcome:
-- the sender didn't receive their delivery, but the courier did the work and
-- is paid in full, so it can be neither 'delivered' nor 'cancelled'.
--
-- Adding the enum value alone here. Postgres won't let a new enum value be
-- used in the same transaction that adds it, so nothing below may reference
-- 'returned' -- the code that does ships in the function, after commit.
alter type delivery_status add value if not exists 'returned';

create type no_answer_policy_enum as enum ('leave_at_door', 'return_to_sender');

alter table public.delivery_requests
  add column if not exists no_answer_policy no_answer_policy_enum
    not null default 'leave_at_door',
  add column if not exists returned_at timestamptz;

comment on column public.delivery_requests.no_answer_policy is
  'What the courier does when nobody is at the dropoff. Chosen by the sender '
  'at posting. Existing rows default to leave_at_door, which is what couriers '
  'were already doing when this shipped.';

-- Return handback reuses the pickup-PIN machinery: the sender holds a code
-- and gives it to the courier, proving the package physically came back.
-- Without it "the courier still gets paid" rewards photographing an empty
-- doorstep and keeping the package.
alter table public.delivery_pins
  add column if not exists return_pin char(4),
  add column if not exists return_attempts int not null default 0,
  add column if not exists return_locked_until timestamptz;

comment on column public.delivery_pins.return_pin is
  'Handback code for a return-to-sender. Same sender-only RLS as pin -- the '
  'courier never reads it, complete-delivery compares it server-side.';
