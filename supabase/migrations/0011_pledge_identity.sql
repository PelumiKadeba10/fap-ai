alter table public.pledges add column if not exists student_name text;
alter table public.pledges add column if not exists tent_number text;
alter table public.pledges add column if not exists matric_number text;

update public.pledges
set student_name = coalesce(nullif(student_name, ''), nullif(contact_name, ''), tent_name),
    tent_number = coalesce(nullif(tent_number, ''), tent_name)
where student_name is null or tent_number is null;
