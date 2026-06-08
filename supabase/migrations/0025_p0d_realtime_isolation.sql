-- P0-D — Tâche 2/3 : isolation Realtime par espace (§16, invariant 15).
-- La RLS ne couvre PAS Realtime par défaut → un client pourrait s'abonner au topic d'un
-- autre tenant. On active l'autorisation par RLS sur realtime.messages : un canal PRIVÉ
-- 'espace:<espace_id>' n'est lisible/diffusable que par un membre de cet espace.
-- realtime.topic() renvoie le topic du canal courant. safe_uuid (0024) parse le segment.

-- SELECT = recevoir les messages du canal ; INSERT = diffuser sur le canal.
create policy "realtime: lecture canal espace membre"
  on realtime.messages for select to authenticated
  using ( public.is_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) ) );

create policy "realtime: diffusion canal espace membre"
  on realtime.messages for insert to authenticated
  with check ( public.is_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) ) );
