-- RT-1 (audit sécurité surface 3/9) — restreindre le canal Realtime 'espace:<id>' aux membres PLEINS.
--
-- CONTEXTE : 0025 autorisait le canal privé 'espace:<espace_id>' à tout `is_member` (niveau espace).
-- Le modèle de partage par SCI (0029-0031) a scopé les TABLES/Storage par entité, mais PAS Realtime
-- (warning explicite en 0030:34-41, 0031:26-27). Un membre SCOPÉ (full_espace=false) pouvait donc
-- rejoindre le canal de l'espace.
--
-- IMPACT RÉEL (vérifié dans le code, plus faible que supposé) : le broadcast `changed` porte un
-- PAYLOAD VIDE (supabase-entry.js:982) et le récepteur déclenche juste un re-pull RLS-filtré
-- (supabase-entry.js:1246) → AUCUNE donnée métier ne transite par Realtime. La fuite pour un scopé
-- était donc : (a) un SIGNAL D'ACTIVITÉ (timing : « quelque chose a changé dans l'espace », même une
-- SCI non accordée) et (b) la PRÉSENCE (noms + qui est en ligne, via track({name,isOwner}) :1252).
--
-- FIX : gater le canal sur is_full_member (0029) au lieu de is_member. Un membre plein (propriétaire
-- ou gestionnaire full) a déjà accès à tout l'espace → recevoir ses signaux/présence est légitime.
-- Un membre scopé n'accède plus au canal (SELECT+INSERT refusés) → plus aucun signal ni présence
-- cross-SCI. SÛR pour l'existant : tout utilisateur actuel est membre plein → comportement inchangé.
--
-- CÔTÉ CLIENT (à faire à l'activation du partage) : pour un membre scopé, NE PAS tenter la
-- souscription (sinon CHANNEL_ERROR bruyant, déjà loggué non-bloquant à :1254) — se reposer sur le
-- re-pull à la reprise de focus (_repullSoon, :1148). Les scopés n'ont pas de live-sync en v1 (poll).
--
-- Dépend de 0024 (safe_uuid), 0025 (policies remplacées), 0029 (is_full_member).

begin;

drop policy if exists "realtime: lecture canal espace membre"   on realtime.messages;
drop policy if exists "realtime: diffusion canal espace membre" on realtime.messages;

-- SELECT = recevoir les messages du canal ; INSERT = diffuser sur le canal. Membre PLEIN uniquement.
create policy "realtime: lecture canal espace membre plein"
  on realtime.messages for select to authenticated
  using ( public.is_full_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) ) );

create policy "realtime: diffusion canal espace membre plein"
  on realtime.messages for insert to authenticated
  with check ( public.is_full_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) ) );

commit;
