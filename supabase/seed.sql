-- Example data for testing. Replace the places with the real beneficiary list before Convocation.
-- Run after all migrations (0001 to 0006).

insert into public.events (name, type, students, starts_at, duration_hours)
values ('Convocation 2026', 'convocation', 8000, '2026-10-30T14:00:00+01:00', 6);

-- Places are a shared list...
insert into public.sites (name, kind, history, capacity, km, direction) values
  ('School A',          'School',    '{160,180,200}', 250, 4.2, 'SE'),
  ('Community B',       'Community', '{90,95,100}',   120, 7.6, 'NE'),
  ('Elderly Home C',    'Care home', '{26,28,30}',     40, 3.1, 'NW'),
  ('Children''s Home D','Care home', '{60,65,70}',     90, 5.0, 'SW'),
  ('Community E',       'Community', '{150,170,175}', 200, 5.9, 'N');

-- ...and each event picks its own, with its own "people to feed".
insert into public.event_sites (event_id, site_id, people)
select e.id, s.id, v.people
from public.events e
join (values ('School A', 200), ('Community B', 100), ('Elderly Home C', 30), ('Children''s Home D', 70), ('Community E', 175)) as v(name, people) on true
join public.sites s on s.name = v.name
where e.name = 'Convocation 2026';

-- Collection points and buses belong to the event.
insert into public.collection_points (event_id, name, location_note, lead_name)
select e.id, v.name, v.note, v.lead
from public.events e
join (values ('Vendor 1 – Cafeteria', 'Student cafeteria, back door', 'Lead 1'), ('Vendor 2 – Convocation Centre', 'Main hall kitchen', 'Lead 2')) as v(name, note, lead) on true
where e.name = 'Convocation 2026';

insert into public.buses (event_id, name, capacity)
select e.id, v.name, 400
from public.events e
join (values ('Bus 1'), ('Bus 2'), ('Bus 3')) as v(name) on true
where e.name = 'Convocation 2026';

insert into public.volunteers (name, phone, vehicle) values
  ('Volunteer 1', '+2348000000001', 'car'),
  ('Volunteer 2', '+2348000000002', 'bike'),
  ('Volunteer 3', '+2348000000003', 'car');
