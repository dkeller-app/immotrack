-- PUB-1 (audit sécurité surface 13) — cohérence / défense en profondeur.
-- 0038 a fait `enable row level security` sur beta_allowlist + app_admins mais PAS `force`
-- (toutes les autres tables métier ont les DEUX). `force` ne change le comportement QUE pour le
-- rôle PROPRIÉTAIRE de la table (et ses fonctions SECURITY DEFINER) — anon/authenticated sont déjà
-- soumis à la RLS dès `enable`. Donc : aucun changement pour les clients, juste l'uniformité (même un
-- accès exécuté en tant que propriétaire de table reste filtré). Pas de fuite client-joignable corrigée
-- ici — c'est un durcissement de cohérence (l'audit l'a classé 🔵).
--
-- Dépend de 0038 (création de beta_allowlist + app_admins avec leurs policies).

begin;

alter table public.beta_allowlist force row level security;
alter table public.app_admins     force row level security;

commit;
