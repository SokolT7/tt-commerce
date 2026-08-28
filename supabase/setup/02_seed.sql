-- ===========================================================================
-- Gate Delivery — seed data (Franjo Tuđman Airport)
--
-- Run AFTER 01_schema.sql. Safe to re-run only on an empty database.
-- Creates the terminal, route graph, 288 QR-coded seats, the shops,
-- their menus, the flight board and two simulated units.
-- ===========================================================================

-- ============================================================================
-- Seed: Franjo Tuđman Airport (ZAG)
--
-- The gate layout and distances are a reconstruction pending a survey with the
-- airport. Merchant names are the real operators.
-- ============================================================================

insert into zones (id, name, short_name, speed_limit_mps, safety_margin_min, orderable, allows_age_restricted) values
 ('landside',             'Landside — public hall',              'Landside',       1.0, 20, false, false),
 ('airside-schengen',     'Airside — Schengen departures',       'Airside Schengen',1.2, 15, true,  false),
 ('airside-non-schengen', 'Airside — non-Schengen departures',   'Non-Schengen',   1.2, 22, false, false),
 ('arrivals',             'Arrivals',                            'Arrivals',       1.0,  0, false, false);

insert into waypoints (id, zone, kind, name, landmark, gate, x, y, dispatchable) values
 ('L-CHECKIN',  'landside','holding','Check-in island','Between check-in rows 3 and 4',null,-60,0,true),
 ('M-CAFENERO', 'landside','merchant','Café Nero — counter','Departures hall, left of check-in',null,-70,14,true),
 ('M-TISAK',    'landside','merchant','Tisak — kiosk','Opposite the information desk',null,-50,-14,true),
 ('M-CAKES',    'landside','merchant','Cakes & Bakes — counter','Upper level, by the escalators',null,-85,-14,true),
 ('L-SECENTRY', 'landside','holding','Security entrance','Start of the screening queue',null,-20,0,true),

 ('SEC-EXIT',   'airside-schengen','holding','Security exit','Where the lanes open into the shops',null,0,0,true),
 ('DOCK-1',     'airside-schengen','dock','Charging dock 1','Service alcove behind duty free',null,14,16,true),
 ('M-AELIA',    'airside-schengen','merchant','Aelia Duty Free — back of house','Staff door, right of the entrance',null,28,-13,true),
 ('M-NEEDSTOP', 'airside-schengen','merchant','NeedStop — collection point','End of the counter, by the fridges',null,52,12,true),
 ('G01-A','airside-schengen','gate','Gate 1 — seating','First seating bank past the shops','1',70,0,true),
 ('G02-A','airside-schengen','gate','Gate 2 — seating','Beside the water fountain','2',85,0,true),
 ('G03-A','airside-schengen','gate','Gate 3 — seating','Opposite the Gate Café','3',100,0,true),
 ('M-GATECAFE','airside-schengen','merchant','Gate Café — counter','Between gates 3 and 4',null,100,13,true),
 ('G04-A','airside-schengen','gate','Gate 4 — seating','Centre of the gate 4 bank','4',115,0,true),
 ('G04-B','airside-schengen','gate','Gate 4 — play area','By the children''s play area','4',115,9,true),
 ('M-PUB','airside-schengen','merchant','The Pub — service end','Left of the bar, by the standing tables',null,122,-13,true),
 ('G05-A','airside-schengen','gate','Gate 5 — seating','Centre of the gate 5 bank','5',130,0,true),
 ('G05-B','airside-schengen','gate','Gate 5 — window side','Against the apron windows','5',130,-9,true),
 ('G06-A','airside-schengen','gate','Gate 6 — seating','Under the flight information screen','6',145,0,true),
 ('M-APRON','airside-schengen','merchant','Apron View — pass','Service pass at the restaurant entrance',null,150,13,true),
 ('G07-A','airside-schengen','gate','Gate 7 — north pillar','By the tall pillar between gates 6 and 7','7',160,0,true),
 ('G07-B','airside-schengen','gate','Gate 7 — window side','Against the windows facing the apron','7',160,9,true),
 ('G08-A','airside-schengen','gate','Gate 8 — seating','Last bank before the pier narrows','8',175,0,true),
 ('HOLD-1','airside-schengen','holding','Holding point — far pier','Service recess by gate 8',null,182,13,true),
 ('DOCK-2','airside-schengen','dock','Charging dock 2','Service alcove at the pier end',null,178,-14,true),
 ('G09-A','airside-schengen','gate','Gate 9 — seating','Facing passport control','9',190,0,true),

 ('DOCK-3','airside-non-schengen','dock','Charging dock 3','Non-Schengen service alcove',null,210,-14,true),
 ('G10-A','airside-non-schengen','gate','Gate 10 — seating','First bank past passport control','10',215,0,true),
 ('G11-A','airside-non-schengen','gate','Gate 11 — seating','Beside the transfer desk','11',230,0,true),
 ('G12-A','airside-non-schengen','gate','Gate 12 — seating','Centre of the gate 12 bank','12',245,0,true),
 ('G12-B','airside-non-schengen','gate','Gate 12 — play area','By the children''s play area','12',245,9,true),
 ('G13-A','airside-non-schengen','gate','Gate 13 — seating','Centre of the gate 13 bank','13',260,0,true),
 ('G13-B','airside-non-schengen','gate','Gate 13 — window side','Against the apron windows','13',260,9,true),
 ('G14-A','airside-non-schengen','gate','Gate 14 — seating','Far end of the non-Schengen pier','14',275,0,true);

-- Corridors. Distances computed from the plan with a detour factor, because
-- real walking paths are not straight lines. No edge crosses a sealed
-- boundary: that is what makes "a mission may never cross a zone" structural.
insert into route_edges (from_waypoint, to_waypoint, metres)
select a, b, round((sqrt(power(w2.x-w1.x,2)+power(w2.y-w1.y,2)) * 1.15)::numeric, 2)
from (values
 ('M-CAKES','M-CAFENERO'),('M-CAFENERO','L-CHECKIN'),('L-CHECKIN','M-TISAK'),('L-CHECKIN','L-SECENTRY'),
 ('SEC-EXIT','DOCK-1'),('SEC-EXIT','M-AELIA'),('M-AELIA','M-NEEDSTOP'),('M-NEEDSTOP','G01-A'),
 ('G01-A','G02-A'),('G02-A','G03-A'),('G03-A','M-GATECAFE'),('G03-A','G04-A'),
 ('G04-A','G04-B'),('G04-A','M-PUB'),('G04-A','G05-A'),('G05-A','G05-B'),('G05-A','G06-A'),
 ('G06-A','M-APRON'),('G06-A','G07-A'),('G07-A','G07-B'),('G07-A','G08-A'),
 ('G08-A','HOLD-1'),('G08-A','DOCK-2'),('G08-A','G09-A'),
 ('DOCK-3','G10-A'),('G10-A','G11-A'),('G11-A','G12-A'),('G12-A','G12-B'),
 ('G12-A','G13-A'),('G13-A','G13-B'),('G13-A','G14-A')
) as e(a,b)
join waypoints w1 on w1.id = e.a
join waypoints w2 on w2.id = e.b;

-- Seats carrying printed QR codes: three rows of eight at every Schengen gate.
-- Each is bound to the nearest point a unit can actually reach, with the walk
-- distance recorded, because a robot cannot drive between rows of seating.
do $$
declare
  g record; r int; s int;
  sx numeric; sy numeric; wp text; wd numeric;
begin
  for g in select id, gate, x, y from waypoints
           where zone = 'airside-schengen' and kind = 'gate' and gate is not null loop
    for r in 1..3 loop
      for s in 1..8 loop
        sx := g.x - 3.5 + (s - 1) * 1.0;
        sy := g.y + (case when g.y >= 0 then 1 else -1 end) * (3.0 + (r - 1) * 1.8);
        select waypoint_id, metres into wp, wd from nearest_waypoint('airside-schengen', sx, sy);
        insert into seats (id, zone, gate, row_label, seat_label, x, y, nav_waypoint_id, walk_metres)
        values (g.id || '-R' || r || '-S' || s, 'airside-schengen', g.gate,
                chr(64 + r), chr(64 + r) || s, sx, sy, wp, round(wd, 2));
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------- merchants
insert into merchants (slug, name, kind, zone, waypoint_id, blurb, colour, prep_minutes, commission_rate) values
 ('needstop','NeedStop','market','airside-schengen','M-NEEDSTOP','Mini-market — sandwiches, salads, coffee and snacks','#0E6E5C',4,0.15),
 ('gatecafe','Gate Café','cafe','airside-schengen','M-GATECAFE','Espresso bar between gates 3 and 4','#B4761A',3,0.15),
 ('aelia','Aelia Duty Free','retail','airside-schengen','M-AELIA','Travel retail — Croatian specialities, beauty, confectionery','#6A4A6E',6,0.11),
 ('apron','Apron View Restaurant','restaurant','airside-schengen','M-APRON','Sit-down dining with views over the apron','#3D5A73',9,0.15),
 ('pub','The Pub','bar','airside-schengen','M-PUB','Bar and snacks by gates 4 and 5','#A8332B',4,0.15),
 ('cafenero','Café Nero','cafe','landside','M-CAFENERO','Departures hall — open from 04:30','#6E7570',4,0.15),
 ('tisak','Tisak','market','landside','M-TISAK','Newsagent — drinks, snacks, SIM cards','#6E7570',3,0.12),
 ('cakes','Cakes & Bakes','cafe','landside','M-CAKES','Bakery — fresh pastries and bread','#6E7570',3,0.15);

insert into merchant_prep_overrides (merchant_id, hour_of_day, prep_minutes)
select m.id, h.hour, h.mins from merchants m
join (values ('needstop',6,7),('needstop',7,8),('needstop',8,7),('needstop',17,6),('needstop',18,6),
             ('gatecafe',6,6),('gatecafe',7,7),('gatecafe',8,6),
             ('apron',7,12),('apron',8,12),('apron',12,14),('apron',13,14))
  as h(slug,hour,mins) on h.slug = m.slug;

insert into product_categories (merchant_id, name, sort_order)
select m.id, c.name, c.ord from merchants m
join (values ('needstop','Hot drinks',1),('needstop','Food',2),('needstop','Cold drinks',3),
             ('gatecafe','Coffee',1),('gatecafe','Bakery',2),
             ('aelia','Croatian specialities',1),('aelia','Beauty',2),('aelia','Spirits',3),
             ('apron','Mains',1),('apron','Drinks',2),
             ('pub','Drinks',1),('pub','Snacks',2))
  as c(slug,name,ord) on c.slug = m.slug;

insert into products (merchant_id, category_id, name, description, price_cents, emoji, age_restricted, allergens, sort_order)
select m.id, pc.id, p.name, p.descr, p.price, p.emoji, p.age, p.allergens, p.ord
from (values
 ('needstop','Hot drinks','Cappuccino','Double shot, whole or oat milk',280,'☕',false,'{}'::text[],1),
 ('needstop','Hot drinks','Espresso','Single shot',190,'☕',false,'{}'::text[],2),
 ('needstop','Food','Ham & cheese toastie','Pressed, served hot',550,'🥪',false,'{gluten,dairy}'::text[],3),
 ('needstop','Food','Caesar salad','Chicken, parmesan, croutons',790,'🥗',false,'{gluten,dairy,egg,fish}'::text[],4),
 ('needstop','Food','Butter croissant','Baked this morning',240,'🥐',false,'{gluten,dairy}'::text[],5),
 ('needstop','Cold drinks','Still water 0.5 L','Jana',220,'💧',false,'{}'::text[],6),
 ('gatecafe','Coffee','Flat white','Double ristretto, silky milk',310,'☕',false,'{dairy}'::text[],1),
 ('gatecafe','Coffee','Cortado','Equal parts espresso and milk',260,'☕',false,'{dairy}'::text[],2),
 ('gatecafe','Bakery','Almond croissant','Filled and toasted',340,'🥐',false,'{gluten,dairy,nuts}'::text[],3),
 ('gatecafe','Coffee','Fresh orange juice','Squeezed to order',420,'🍊',false,'{}'::text[],4),
 ('aelia','Croatian specialities','Croatian olive oil 500 ml','Istrian extra virgin, award-winning',1890,'🫒',false,'{}'::text[],1),
 ('aelia','Croatian specialities','Truffle spread 80 g','Istrian black truffle',1250,'🍄',false,'{}'::text[],2),
 ('aelia','Croatian specialities','Bajadera pralines 300 g','Kraš — the classic Croatian gift',790,'🍫',false,'{nuts,dairy}'::text[],3),
 ('aelia','Beauty','Sun lotion SPF 50','200 ml',1450,'🧴',false,'{}'::text[],4),
 ('aelia','Beauty','Eau de parfum 50 ml','Selected designer fragrance',6200,'🌸',false,'{}'::text[],5),
 ('aelia','Spirits','Croatian rakija 0.7 L','Travarica herbal brandy',2400,'🍾',true,'{}'::text[],6),
 ('apron','Mains','Club sandwich','Chicken, bacon, egg, fries',1150,'🥪',false,'{gluten,egg}'::text[],1),
 ('apron','Mains','Soup of the day','Served with bread',590,'🍲',false,'{gluten}'::text[],2),
 ('apron','Drinks','Fresh orange juice','0.3 L',450,'🍊',false,'{}'::text[],3),
 ('pub','Drinks','Soft drink 0.33 L','Cola, tonic or lemonade',320,'🥤',false,'{}'::text[],1),
 ('pub','Snacks','Crisps','Salted or paprika',280,'🍟',false,'{}'::text[],2),
 ('pub','Drinks','Draught beer 0.5 L','Ožujsko on tap',550,'🍺',true,'{gluten}'::text[],3),
 ('cafenero','Coffee','Caffè latte','Regular',290,'☕',false,'{dairy}'::text[],1),
 ('tisak','Snacks','Croatian SIM card','Prepaid data, 10 GB',1000,'📱',false,'{}'::text[],1),
 ('cakes','Bakery','Burek','Cheese or meat',350,'🥟',false,'{gluten,dairy}'::text[],1)
) as p(slug,cat,name,descr,price,emoji,age,allergens,ord)
join merchants m on m.slug = p.slug
left join product_categories pc on pc.merchant_id = m.id and pc.name = p.cat;

-- Modifier group, to prove the shape end to end.
insert into product_option_groups (product_id, name, min_select, max_select)
select id, 'Milk', 1, 1 from products where name in ('Cappuccino','Flat white','Cortado');

insert into product_options (group_id, name, price_delta_cents, sort_order)
select g.id, o.name, o.delta, o.ord from product_option_groups g
cross join (values ('Whole milk',0,1),('Oat milk',40,2),('Lactose free',40,3)) as o(name,delta,ord)
where g.name = 'Milk';

-- ------------------------------------------------------------------ fleet --
insert into robots (id, name, zone, home_dock_id, waypoint_id, x, y, status, battery_pct) values
 ('SB-01','Speedybot 01','airside-schengen','DOCK-1','DOCK-1',14,16,'idle',96),
 ('SB-02','Speedybot 02','airside-schengen','DOCK-2','DOCK-2',178,-14,'idle',94);

insert into robot_compartments (robot_id, id, label)
select r.id, 'C' || n, 'Compartment ' || n
from robots r cross join generate_series(1,6) as n;

-- ---------------------------------------------------------------- flights --
insert into flights (id, flight_number, carrier, destination, destination_code, non_eu, gate, boarding_at, departs_at) values
 ('ou654','OU 654','Croatia Airlines','Paris Charles de Gaulle','CDG',false,'7',now()+interval '42 min',now()+interval '62 min'),
 ('lh1727','LH 1727','Lufthansa','Munich','MUC',false,'3',now()+interval '12 min',now()+interval '32 min'),
 ('ou490','OU 490','Croatia Airlines','Frankfurt','FRA',false,'5',now()+interval '55 min',now()+interval '75 min'),
 ('ou340','OU 340','Croatia Airlines','Amsterdam','AMS',false,'8',now()+interval '78 min',now()+interval '98 min'),
 ('fr4834','FR 4834','Ryanair','London Stansted','STN',true,'12',now()+interval '70 min',now()+interval '90 min'),
 ('tk1054','TK 1054','Turkish Airlines','Istanbul','IST',true,'13',now()+interval '95 min',now()+interval '115 min');
