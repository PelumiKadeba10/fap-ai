-- Example data for testing. Replace sites with the real beneficiary list before Convocation.

insert into public.events (name, type, students, starts_at, duration_hours)
values ('Convocation 2026', 'convocation', 8000, '2026-10-30T14:00:00+01:00', 6);

insert into public.sites (name, kind, history, capacity, km, direction) values
  ('School A',          'School',    '{160,180,200}', 250, 4.2, 'SE'),
  ('Community B',       'Community', '{90,95,100}',   120, 7.6, 'NE'),
  ('Elderly Home C',    'Care home', '{26,28,30}',     40, 3.1, 'NW'),
  ('Children''s Home D','Care home', '{60,65,70}',     90, 5.0, 'SW'),
  ('Community E',       'Community', '{150,170,175}', 200, 5.9, 'N');

insert into public.volunteers (name, phone, vehicle) values
  ('Volunteer 1', '+2348000000001', 'car'),
  ('Volunteer 2', '+2348000000002', 'bike'),
  ('Volunteer 3', '+2348000000003', 'car');

insert into public.buses (name, capacity) values
  ('Bus 1', 400),
  ('Bus 2', 400),
  ('Bus 3', 400);
