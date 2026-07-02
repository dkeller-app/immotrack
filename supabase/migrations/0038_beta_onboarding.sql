-- Onboarding bêta : allowlist d'inscription + super-admin global + auto-ajout des invités.
-- Dépend de 0001 (espaces/espace_members), 0032 (invitations). Le hook d'inscription est en 0039.
begin;

-- ── Allowlist : seuls ces emails peuvent créer un compte (vérifié par le hook 0039) ──
create table public.beta_allowlist (
  email            text primary key,                 -- normalisé lower(trim())
  source           text not null default 'admin',    -- 'admin' (testeur ajouté par le super-admin) | 'invitation' (partenaire)
  added_by         uuid references auth.users(id),
  invited_by_email text,                             -- source='invitation' : email du testeur qui a invité (affichage « via … »)
  invitation_id    uuid references public.invitations(id) on delete set null,
  created_at       timestamptz not null default now(),
  registered_at    timestamptz                        -- rempli quand le compte est créé (trigger auth.users)
);

-- ── Super-admins globaux (≠ owner d'espace) : accès à l'écran admin bêta ──
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helper : l'appelant est-il super-admin ? SECURITY DEFINER pour lire app_admins malgré la RLS.
create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_app_admin() to authenticated;

-- ── RLS ──
alter table public.beta_allowlist enable row level security;
alter table public.app_admins     enable row level security;

-- beta_allowlist : lecture/écriture réservées au super-admin (l'auto-ajout invité passe par le trigger SECURITY DEFINER).
create policy beta_allowlist_admin_all on public.beta_allowlist
  for all using (public.is_app_admin()) with check (public.is_app_admin());

-- app_admins : chacun peut lire SA ligne (pour résoudre __immoIsAdmin) ; écriture = service_role only (aucune policy write).
create policy app_admins_self_read on public.app_admins
  for select using (user_id = auth.uid());

-- ── Auto-ajout de l'email d'un partenaire invité à l'allowlist ──
-- Le testeur crée une invitation avec invite_email → l'email devient autorisé (le hook le laissera passer).
create or replace function public.invitation_to_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inviter text;
begin
  if new.invite_email is not null and length(trim(new.invite_email)) > 0 then
    select u.email into v_inviter from auth.users u where u.id = new.created_by;
    insert into public.beta_allowlist (email, source, added_by, invited_by_email, invitation_id)
    values (lower(trim(new.invite_email)), 'invitation', new.created_by, v_inviter, new.id)
    on conflict (email) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_invitation_to_allowlist
  after insert on public.invitations
  for each row execute function public.invitation_to_allowlist();

-- ── Marque « inscrit » (registered_at) à la création réelle du compte ──
-- Séparé du hook 0039, qui reste READ-ONLY (gate pur). Patron classique d'un trigger AFTER INSERT
-- sur auth.users (comme handle_new_user), SECURITY DEFINER pour écrire beta_allowlist malgré la RLS.
create or replace function public.beta_mark_registered()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.beta_allowlist set registered_at = now()
    where email = lower(trim(new.email)) and registered_at is null;
  return new;
end;
$$;

create trigger trg_beta_mark_registered
  after insert on auth.users
  for each row execute function public.beta_mark_registered();

commit;
