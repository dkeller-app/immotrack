-- §17-8 : rafraîchit updated_at et incrémente version à chaque UPDATE.
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger trg_touch_espaces
  before update on public.espaces
  for each row execute function public.touch_row();

create trigger trg_touch_espace_members
  before update on public.espace_members
  for each row execute function public.touch_row();

-- §17-2 : un espace conserve toujours ≥1 membre owner actif.
-- Refuse la suppression OU la rétrogradation/désactivation du DERNIER owner actif.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_espace uuid := coalesce(old.espace_id, new.espace_id);
  v_remaining int;
begin
  -- l'ancien état comptait-il comme owner actif ?
  if old.role = 'owner' and old.invite_status = 'active' then
    -- le nouvel état reste-t-il owner actif ? (UPDATE qui ne touche pas owner → ok)
    if tg_op = 'UPDATE' and new.role = 'owner' and new.invite_status = 'active' then
      return new;
    end if;
    select count(*) into v_remaining
    from public.espace_members
    where espace_id = v_espace
      and role = 'owner' and invite_status = 'active'
      and id <> old.id;
    if v_remaining = 0 then
      raise exception 'LAST_OWNER_PROTECTED';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_protect_last_owner
  before update or delete on public.espace_members
  for each row execute function public.protect_last_owner();
