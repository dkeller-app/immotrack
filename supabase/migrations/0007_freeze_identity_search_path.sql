-- Homogénéité du durcissement (re-audit code-reviewer P0-A) : members_freeze_identity()
-- recréée avec set search_path='' comme TOUTES les autres fonctions du projet
-- (is_member, has_role, create_espace, touch_row, protect_last_owner).
-- Non exploitable en l'état (aucun objet non qualifié référencé) mais évite toute
-- régression future si du code y est ajouté. Append-only : ne modifie pas 0006 déjà poussée.
create or replace function public.members_freeze_identity()
returns trigger
language plpgsql
set search_path = ''
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
