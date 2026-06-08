-- P0-C2 — Tâche 2/5 : crochets d'abonnement sur espaces (§12-4, invariant 13).
-- HOOK seulement : aucun trigger ne lit ces colonnes pour bloquer (enforcement P5).
-- Append-only : ne modifie pas 0001.

alter table public.espaces
  add column plan_id             text not null default 'free' references public.plans(id),
  add column subscription_source text,                    -- 'stripe' | 'trial' | 'comp'
  add column subscription_status text,                    -- spectre Stripe (nullable)
  add column trial_ends_at       timestamptz,
  add column stripe_customer_id  text,                    -- client Stripe RATTACHÉ À L'ESPACE (invariant 13)
  add column comp_reason         text,
  add column comp_granted_by     uuid references auth.users(id),
  add column comp_granted_at     timestamptz;

-- source ∈ {stripe, trial, comp} (invariant 13). NULL autorisé (espace sans abonnement défini).
alter table public.espaces
  add constraint espaces_subscription_source_chk
  check (subscription_source is null or subscription_source in ('stripe','trial','comp'));

-- spectre de statuts Stripe à mapper explicitement (§12-4) — documenté au niveau schéma.
alter table public.espaces
  add constraint espaces_subscription_status_chk
  check (subscription_status is null or subscription_status in (
    'trialing','active','incomplete','incomplete_expired','past_due','unpaid','canceled','paused'));

-- backfill des espaces déjà créés (P0-A/B/C1) : plancher « free » (le default ne couvre
-- que les futures lignes). Sûr : aucun enforcement en P0, donc aucun effet bloquant.
update public.espaces set plan_id = 'free' where plan_id is null;
