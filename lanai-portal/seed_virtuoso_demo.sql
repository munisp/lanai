-- Lanai Virtuoso demo seed (corrected: quoted camelCase identifiers + Aisha PIN).
-- Aisha logs in at /client with PIN 123456.
INSERT INTO members (email, name, tier, active, "onboardingComplete", nationality, "dietaryRequirements", "pinHash")
SELECT 'aisha@lanai.demo', 'Aisha Okoye', 'platinum', true, true, 'Nigerian', 'Pescatarian', '$2b$12$wMh6CUZTssWn.yr/ExV.Cewzj4HNridY5yjy8Kz5VCiK7Yfpdb2yW'
WHERE NOT EXISTS (SELECT 1 FROM members WHERE email = 'aisha@lanai.demo');

INSERT INTO member_preferences ("memberId", "travelStyle", "preferredCabinClass", "preferredRoomType", "mealPreference", "favouriteDestinations", "preferredAirlines")
SELECT m.id, 'Luxury and culture', 'Business', 'Deluxe King', 'Pescatarian', '["Paris","Maldives","Amalfi Coast"]'::jsonb, '["British Airways","Air France"]'::jsonb
FROM members m WHERE m.email = 'aisha@lanai.demo'
ON CONFLICT ("memberId") DO NOTHING;

INSERT INTO suppliers (name, category, "subCategory", country, city, "propertyType", rating, "isVirtuoso", "preferredPartnerNetwork", "contactEmail", website)
SELECT 'Four Seasons Hotel George V, Paris', 'Hotel', 'Luxury Hotel', 'France', 'Paris', 'hotel', 5, true, 'virtuoso', 'reservations@fourseasons.com', 'https://www.fourseasons.com/paris'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Four Seasons Hotel George V, Paris');
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency, "seasonNotes")
SELECT s.id, 'standard', 1450.00, 'EUR', 'Sep baseline' FROM suppliers s WHERE s.name = 'Four Seasons Hotel George V, Paris';
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency, "seasonNotes")
SELECT s.id, 'deluxe', 1850.00, 'EUR', 'Sep baseline' FROM suppliers s WHERE s.name = 'Four Seasons Hotel George V, Paris';
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency, "seasonNotes")
SELECT s.id, 'junior_suite', 2400.00, 'EUR', 'Sep baseline' FROM suppliers s WHERE s.name = 'Four Seasons Hotel George V, Paris';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType", description)
SELECT s.id, 'Room upgrade at check-in', 'virtuoso_perk', 'Subject to availability' FROM suppliers s WHERE s.name = 'Four Seasons Hotel George V, Paris';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Daily breakfast for two', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Four Seasons Hotel George V, Paris';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'USD 100 food and beverage credit', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Four Seasons Hotel George V, Paris';

INSERT INTO suppliers (name, category, "subCategory", country, city, "propertyType", rating, "isVirtuoso", "preferredPartnerNetwork", "contactEmail", website)
SELECT 'Park Hyatt Paris-Vendome', 'Hotel', 'Luxury Hotel', 'France', 'Paris', 'hotel', 5, true, 'virtuoso', 'reservations@hyatt.com', 'https://www.hyatt.com/park-hyatt/paris'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Park Hyatt Paris-Vendome');
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'standard', 980.00, 'EUR' FROM suppliers s WHERE s.name = 'Park Hyatt Paris-Vendome';
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'deluxe', 1280.00, 'EUR' FROM suppliers s WHERE s.name = 'Park Hyatt Paris-Vendome';
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'junior_suite', 1750.00, 'EUR' FROM suppliers s WHERE s.name = 'Park Hyatt Paris-Vendome';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Room upgrade at check-in', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Park Hyatt Paris-Vendome';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Daily breakfast for two', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Park Hyatt Paris-Vendome';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Late checkout 4pm', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Park Hyatt Paris-Vendome';

INSERT INTO suppliers (name, category, "subCategory", country, city, "propertyType", rating, "isVirtuoso", "preferredPartnerNetwork", "contactEmail", website)
SELECT 'Waldorf Astoria Trianon Palace Versailles', 'Hotel', 'Luxury Hotel', 'France', 'Paris', 'hotel', 5, true, 'virtuoso', 'reservations@hilton.com', 'https://www.hilton.com/waldorf'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Waldorf Astoria Trianon Palace Versailles');
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'standard', 720.00, 'EUR' FROM suppliers s WHERE s.name = 'Waldorf Astoria Trianon Palace Versailles';
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'deluxe', 950.00, 'EUR' FROM suppliers s WHERE s.name = 'Waldorf Astoria Trianon Palace Versailles';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Room upgrade at check-in', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Waldorf Astoria Trianon Palace Versailles';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Daily breakfast for two', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Waldorf Astoria Trianon Palace Versailles';

INSERT INTO suppliers (name, category, "subCategory", country, city, "propertyType", rating, "isVirtuoso", "preferredPartnerNetwork", "contactEmail", website)
SELECT 'Le Bristol Paris', 'Hotel', 'Luxury Hotel', 'France', 'Paris', 'hotel', 5, true, 'virtuoso', 'reservations@lebristolparis.com', 'https://www.lebristolparis.com'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Le Bristol Paris');
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'standard', 1250.00, 'EUR' FROM suppliers s WHERE s.name = 'Le Bristol Paris';
INSERT INTO supplier_room_rates ("supplierId", "roomTier", "startingRate", currency)
SELECT s.id, 'suite', 2100.00, 'EUR' FROM suppliers s WHERE s.name = 'Le Bristol Paris';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Room upgrade at check-in', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Le Bristol Paris';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'Daily breakfast for two', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Le Bristol Paris';
INSERT INTO supplier_amenities ("supplierId", name, "benefitType")
SELECT s.id, 'EUR 100 spa credit', 'virtuoso_perk' FROM suppliers s WHERE s.name = 'Le Bristol Paris';

INSERT INTO travel_requests ("memberId", destination, dates, pax, status, notes, "specialRequests")
SELECT m.id, 'Paris', '14-18 Sep 2026', 2, 'proposal_sent', 'Anniversary trip; prefers Park Hyatt or Four Seasons.', 'Late checkout ideal'
FROM members m WHERE m.email = 'aisha@lanai.demo';

INSERT INTO travel_requests ("memberId", destination, dates, pax, status, notes)
SELECT m.id, 'Amalfi Coast', '10-17 Jun 2025', 2, 'completed', 'Past stay; booked a private villa with chef.'
FROM members m WHERE m.email = 'aisha@lanai.demo';
