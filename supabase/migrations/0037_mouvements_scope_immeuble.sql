-- P1 — Partage par SCI : mouvements résolus AUSSI via immeuble_id (correctif #3 test partage).
--
-- Un mouvement déclaré sur l'IMMEUBLE (immeuble_id renseigné, mais entite_id ET logement_id NULL —
-- ex. charges/travaux d'immeuble sans logement précis) tombait en fail-closed : `coalesce(entite_id,
-- entite_of_logement(logement_id))` = NULL → invisible d'un membre SCOPÉ (alors qu'il a accès à la SCI
-- de cet immeuble). On AJOUTE la résolution via `entite_of_immeuble(immeuble_id)`, exactement comme la
-- table `agenda` (0030). Premier non-NULL gagne. Idempotent (drop if exists + recreate).
-- Dépend de 0030 (helpers entite_of_logement / entite_of_immeuble, has_entite_access / has_entite_write).

begin;

drop policy if exists mouvements_select on public.mouvements;
drop policy if exists mouvements_insert on public.mouvements;
drop policy if exists mouvements_update on public.mouvements;
drop policy if exists mouvements_delete on public.mouvements;

create policy mouvements_select on public.mouvements
  for select to authenticated
  using ( public.has_entite_access(espace_id, coalesce(entite_id,
            public.entite_of_logement(espace_id, logement_id),
            public.entite_of_immeuble(espace_id, immeuble_id))) );
create policy mouvements_insert on public.mouvements
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, coalesce(entite_id,
            public.entite_of_logement(espace_id, logement_id),
            public.entite_of_immeuble(espace_id, immeuble_id))) );
create policy mouvements_update on public.mouvements
  for update to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id,
            public.entite_of_logement(espace_id, logement_id),
            public.entite_of_immeuble(espace_id, immeuble_id))) )
  with check ( public.has_entite_write(espace_id, coalesce(entite_id,
            public.entite_of_logement(espace_id, logement_id),
            public.entite_of_immeuble(espace_id, immeuble_id))) );
create policy mouvements_delete on public.mouvements
  for delete to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id,
            public.entite_of_logement(espace_id, logement_id),
            public.entite_of_immeuble(espace_id, immeuble_id))) );

commit;
