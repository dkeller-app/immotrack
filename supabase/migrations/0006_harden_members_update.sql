-- Durcissement post-audit (code-reviewer P0-A). Ne modifie JAMAIS 0001-0005 déjà poussées.
--
-- SEV-1 : un owner pouvait, via UPDATE, réécrire espace_id/user_id d'une ligne membre
--         → « kidnapping » d'un membre vers un autre espace, ou déplacement d'un membre
--           dans son propre espace. espace_id est LA clé d'isolation de tout P0-B.
--         Ferme aussi le contournement « dernier owner » par mise à NULL de user_id.
--         Solution robuste = trigger d'immutabilité (s'applique même au service_role,
--         contrairement à un simple with check RLS que le bypassrls ignorerait).
-- SEV-3 : touch_row() sans search_path='' (durcissement search_path manquant).
-- SEV-3 : policy espaces_insert permettait de créer un espace orphelin (sans membre,
--         donc invisible de tous) ; le bootstrap réel passe par create_espace().

-- ── SEV-1 : identité d'une ligne membre figée (espace_id + user_id immuables) ──
create or replace function public.members_freeze_identity()
returns trigger
language plpgsql
as $$
begin
  if new.espace_id is distinct from old.espace_id then
    raise exception 'ESPACE_ID_IMMUTABLE';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'USER_ID_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger trg_members_freeze_identity
  before update on public.espace_members
  for each row execute function public.members_freeze_identity();

-- ── SEV-3 : durcissement search_path de touch_row (recréation à l'identique + set) ──
create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- ── SEV-3 : suppression de la garde espaces_insert (espace orphelin possible) ──
-- Le bootstrap atomique espace + owner passe exclusivement par create_espace() (0004).
drop policy if exists espaces_insert on public.espaces;
