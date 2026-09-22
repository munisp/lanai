-- Custom itineraries: advisor-built, member-facing day-by-day plans
CREATE TABLE IF NOT EXISTS custom_itineraries (
  id serial PRIMARY KEY,
  member_id integer NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  advisor_user_id integer REFERENCES users(id),
  title varchar(255) NOT NULL,
  destination varchar(255),
  status varchar(32) NOT NULL DEFAULT 'draft',
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_itineraries_member_id_idx ON custom_itineraries(member_id);
CREATE INDEX IF NOT EXISTS custom_itineraries_status_idx ON custom_itineraries(status);
