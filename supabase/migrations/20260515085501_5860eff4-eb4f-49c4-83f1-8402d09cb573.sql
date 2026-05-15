
insert into storage.buckets (id, name, public)
values ('garmin-devices', 'garmin-devices', true)
on conflict (id) do update set public = true;

create policy "garmin-devices public read"
on storage.objects for select
using (bucket_id = 'garmin-devices');

create policy "garmin-devices anyone insert"
on storage.objects for insert
with check (bucket_id = 'garmin-devices');

create policy "garmin-devices anyone update"
on storage.objects for update
using (bucket_id = 'garmin-devices');
