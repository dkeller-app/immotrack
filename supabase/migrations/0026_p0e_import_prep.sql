-- P0-E — Préparation de l'import tenant #1 (données réelles).
-- Deux ajustements schéma RÉVÉLÉS par le dry-run sur les vraies données :
--
-- A) legacy_raw jsonb (NO-LOSS) sur les 9 tables cibles. Le blob a des objets riches
--    (logement ~65 champs, bail ~95) ; les tables P0-B en mappent une partie en colonnes
--    typées + quelques jsonb. legacy_raw stocke l'enregistrement d'origine VERBATIM →
--    zéro perte sur ce premier import réel. Droppable plus tard une fois la confiance acquise.
--
-- B) documents.parent_type : la contrainte n'autorisait que {mouvement, immeuble} mais les
--    vraies données ont aussi des documents rattachés à un logement (14) et une entité (1).
--    On élargit à {mouvement, immeuble, logement, entite, bail}.

-- A) ──────────────────────────────────────────────────────────────────────────
do $legacy$
declare t text;
begin
  foreach t in array array[
    'entites','immeubles','logements','documents','mouvements',
    'quittances','baux','baux_historique','edl'
  ] loop
    execute format('alter table public.%I add column if not exists legacy_raw jsonb', t);
  end loop;
end
$legacy$;

-- B) ──────────────────────────────────────────────────────────────────────────
alter table public.documents drop constraint if exists documents_parent_type_check;
alter table public.documents
  add constraint documents_parent_type_check
  check (parent_type is null or parent_type in ('mouvement','immeuble','logement','entite','bail'));
