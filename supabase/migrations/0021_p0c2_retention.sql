-- P0-C2 — Tâche 4/5 : colonnes de rétention légale (§9 l.183, §11 l.222, invariant 12).
-- HOOK seulement : ces colonnes PILOTERONT l'effacement sélectif RGPD ; AUCUN moteur de
-- purge ne tourne en P0 (P5). Posées sur les 4 tables nommées par l'invariant 12
-- (bail/EDL/quittances + baux_historique archivé). PAS sur documents (polymorphe) ni sur
-- candidatures/cautions (tables inexistantes en P0) → différé.
-- Append-only : ne modifie pas 0011/0012/0013.

do $ret$
declare t text;
begin
  foreach t in array array['baux','edl','quittances','baux_historique'] loop
    execute format($f$
      alter table public.%I
        add column retention_class text not null default 'bail_plus_3ans',
        add column legal_basis      text not null default 'obligation_legale',
        add column retention_until  timestamptz
    $f$, t);

    -- classes de rétention extensibles (invariant 12). Couvre bail+3/5 ans, caution 3 ans,
    -- candidature 3 mois, et 'autre' pour l'extension.
    execute format($f$
      alter table public.%I add constraint %I
        check (retention_class in
          ('bail_plus_3ans','bail_plus_5ans','caution_3ans','candidature_3mois','autre'))
    $f$, t, t || '_retention_class_chk');

    -- base légale (RGPD art. 6). 'obligation_legale' par défaut (rétention bail).
    execute format($f$
      alter table public.%I add constraint %I
        check (legal_basis in
          ('obligation_legale','execution_contrat','consentement','interet_legitime'))
    $f$, t, t || '_legal_basis_chk');
  end loop;
end
$ret$;
