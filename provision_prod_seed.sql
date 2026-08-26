-- Lanai prod DB seed: suppliers + supplier services (idempotent)
-- Run: kubectl -n lanai exec -i deployment/postgres -- psql -U lanai -d lanai < provision_prod_seed.sql

-- Suppliers
INSERT INTO suppliers (name, category, country, city, rating, "preferredStatus", "defaultCommissionRate", "contactEmail")
SELECT 'Aman Resorts','Hotel','Indonesia','Bali',5,true,'12.00','res@aman.com'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name='Aman Resorts');
INSERT INTO suppliers (name, category, country, city, rating, "preferredStatus", "defaultCommissionRate", "contactEmail")
SELECT 'Belmond','Hotel','Italy','Amalfi Coast',5,true,'10.00','res@belmond.com'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name='Belmond');
INSERT INTO suppliers (name, category, country, city, rating, "preferredStatus", "defaultCommissionRate", "contactEmail")
SELECT 'VistaJet','Private Jet','Global',NULL,5,true,'8.00','charter@vistajet.com'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name='VistaJet');
INSERT INTO suppliers (name, category, country, city, rating, "preferredStatus", "defaultCommissionRate", "contactEmail")
SELECT 'Fraser Yachts','Yacht','Greece','Athens',4,false,'15.00','charter@fraseryachts.com'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name='Fraser Yachts');
INSERT INTO suppliers (name, category, country, city, rating, "preferredStatus", "defaultCommissionRate", "contactEmail")
SELECT 'The Connaught','Hotel','United Kingdom','London',5,true,'10.00','res@connaught.com'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name='The Connaught');

-- Supplier services
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'hotel_room: Aman Ocean Suite','Signature ocean-view suite with private terrace','1850.00','GBP',true FROM suppliers s WHERE s.name='Aman Resorts'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='hotel_room: Aman Ocean Suite');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'spa: Aman Spa Ritual','Two-hour bespoke spa ritual','450.00','GBP',true FROM suppliers s WHERE s.name='Aman Resorts'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='spa: Aman Spa Ritual');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'hotel_room: Deluxe ocean suite','Deluxe ocean-view suite','10.00','GBP',true FROM suppliers s WHERE s.name='Belmond'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='hotel_room: Deluxe ocean suite');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'hotel_room: Belmond Grand Suite','Grand suite with butler service','2200.00','GBP',true FROM suppliers s WHERE s.name='Belmond'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='hotel_room: Belmond Grand Suite');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'dining: Michelin Star Dinner','Seven-course tasting menu for two','380.00','GBP',true FROM suppliers s WHERE s.name='Belmond'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='dining: Michelin Star Dinner');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'private_jet: Global 7500 Charter','Global 7500 private jet charter','45000.00','GBP',true FROM suppliers s WHERE s.name='VistaJet'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='private_jet: Global 7500 Charter');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'yacht_charter: 40m Motor Yacht','40m motor yacht with full crew','12000.00','GBP',true FROM suppliers s WHERE s.name='Fraser Yachts'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='yacht_charter: 40m Motor Yacht');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'hotel_room: Connaught Penthouse','Penthouse suite overlooking Mayfair','2800.00','GBP',true FROM suppliers s WHERE s.name='The Connaught'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='hotel_room: Connaught Penthouse');
INSERT INTO supplier_services ("supplierId", "serviceType", description, "basePrice", currency, "isActive")
SELECT s.id,'experience: Afternoon Tea','Classic afternoon tea for two','120.00','GBP',true FROM suppliers s WHERE s.name='The Connaught'
AND NOT EXISTS (SELECT 1 FROM supplier_services ss WHERE ss."supplierId"=s.id AND ss."serviceType"='experience: Afternoon Tea');
