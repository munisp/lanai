-- Provision the demo member in production so the client can log in at lanai.newfire.app
-- PIN: 123456  (bcrypt hash generated with cost 12)
INSERT INTO members (email, name, "pinHash", tier, "onboardingComplete", active, phone, nationality, "createdAt", "updatedAt")
VALUES ('demo@lanai.test', 'Demo Member', '$2b$12$wMh6CUZTssWn.yr/ExV.Cewzj4HNridY5yjy8Kz5VCiK7Yfpdb2yW', 'platinum', true, true, '+447700900123', 'British', now(), now())
ON CONFLICT (email) DO NOTHING;

-- Demo travel requests so the dashboard is populated
INSERT INTO travel_requests ("memberId", destination, "originCity", dates, pax, budget, status, priority, notes, "createdAt", "updatedAt")
SELECT m.id, 'Santorini, Greece', 'London', '14–21 Sep 2026', 2, '25000', 'proposal_sent', 'high', 'Sea view, quiet luxury, private transfer', now(), now()
FROM members m WHERE m.email = 'demo@lanai.test'
ON CONFLICT DO NOTHING;

INSERT INTO travel_requests ("memberId", destination, "originCity", dates, pax, budget, status, priority, notes, "createdAt", "updatedAt")
SELECT m.id, 'Kyoto, Japan', 'London', '5–12 Nov 2026', 2, '20000', 'new', 'medium', 'Traditional ryokan experience', now(), now()
FROM members m WHERE m.email = 'demo@lanai.test'
ON CONFLICT DO NOTHING;
