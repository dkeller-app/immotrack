-- Primitive de suppression d'espace (offboarding tenant + démontage de test propre).
-- Append-only. SUPPRESSION DURE d'un tenant entier — distincte de l'effacement sélectif
-- RGPD (droit à l'oubli en conservant le signé sous rétention) qui relève du moteur de
-- purge piloté par retention_* (P5).

-- 1) Échappatoire d'administration pour protect_last_owner (symétrique à app.bypass_immutable
--    de 0014). Settable UNIQUEMENT depuis une session DB privilégiée (jamais PostgREST :
--    authenticated/anon ne peuvent pas SET app.*). Redéfinition à l'identique + garde en tête.
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
  -- échappatoire offboarding/admin : purge_espace pose ce GUC en local.
  if coalesce(current_setting('app.bypass_owner_guard', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if old.role = 'owner' and old.invite_status = 'active' then
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

-- 2) purge_espace : supprime intégralement un espace. SECURITY DEFINER (s'exécute en
--    postgres → pose les GUC d'échappatoire et contourne la RLS). EXECUTE réservé à
--    service_role (jamais authenticated/anon).
create or replace function public.purge_espace(p_espace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- échappatoires (transaction-locales) pour les triggers protecteurs.
  perform set_config('app.bypass_immutable',   'on', true);
  perform set_config('app.bypass_owner_guard', 'on', true);

  -- Neutraliser les FK ON DELETE RESTRICT pointant vers baux AVANT la cascade
  -- (RESTRICT est vérifié immédiatement, pas déféré → casserait la cascade).
  delete from public.baux_evenements where espace_id = p_espace_id;
  update public.baux set amends_id = null where espace_id = p_espace_id and amends_id is not null;

  -- La cascade espace_id→espaces (ON DELETE CASCADE) supprime membres + données métier ;
  -- prevent_locked_mutation (0014) et protect_last_owner honorent les GUC ci-dessus.
  delete from public.espaces where id = p_espace_id;
end;
$$;

-- Supabase accorde par DÉFAUT execute à anon + authenticated sur les fonctions public :
-- un simple `revoke from public` ne suffit PAS (ces grants sont explicites). On révoque
-- explicitement les trois → seul service_role (et le owner postgres) peut purger un tenant.
-- Sans ça, n'importe quel authenticated pourrait purger n'importe quel espace par UUID.
revoke execute on function public.purge_espace(uuid) from public, anon, authenticated;
grant  execute on function public.purge_espace(uuid) to service_role;
