// supabase/functions/purge-medias-edl — TÂCHE PLANIFIÉE : purge des vidéos d'état des lieux à échéance
// (EDL-VIDEO-IA, migration 0058). Appelée une fois par jour par pg_cron (voir le rapport de chantier :
// procédure d'activation). Rôle SERVICE (variable SUPABASE_SERVICE_ROLE_KEY fournie par Supabase) :
// seul habilité à lire edl_medias_a_purger et à effacer un fichier scellé ; la base refuse de toute façon
// une ligne scellée avant échéance (garde 0058). Aucun contenu dans les journaux, des nombres seulement.
//
// Garde d'appel : en-tête x-purge-secret = secret PURGE_CRON_SECRET (comparaison à temps constant).
// Déploiement (pilotage) : supabase functions deploy purge-medias-edl --no-verify-jwt
//                          supabase secrets set PURGE_CRON_SECRET=<aléatoire>
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { purger, interpreterSuppression } from './purge.js';

const BUCKET = 'espace-files';

function egal(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = Deno.env.get('PURGE_CRON_SECRET') || '';
  if (!egal(req.headers.get('x-purge-secret') || '', secret)) return new Response('forbidden', { status: 403 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const bilan = await purger({
    aPurger: async (limite: number) => {
      const { data, error } = await sb.rpc('edl_medias_a_purger', { p_limite: limite });
      if (error) throw new Error('rpc');
      return data || [];
    },
    effacer: async (chemins: string[]) => {
      const { data, error } = await sb.storage.from(BUCKET).remove(chemins);
      return interpreterSuppression(chemins, data, error, async (p: string) => {
        const { error: e } = await sb.storage.from(BUCKET).createSignedUrl(p, 10);
        return !(e && /not.?found|does not exist/i.test(String((e as { message?: string }).message || '')));
      });
    },
    // La base supprime seulement les lignes ENCORE à échéance (gel posé entre-temps = gardée) et rend leurs chemins.
    supprimer: async (ids: string[]) => {
      const { data, error } = await sb.rpc('edl_medias_purger_lignes', { p_ids: ids });
      if (error) throw new Error('rpc');
      return (data || []).map((r: { storage_path: string }) => r.storage_path);
    },
  });
  console.log(`[purge-medias-edl] lus=${bilan.lus} fichiers=${bilan.fichiers} lignes=${bilan.lignes} echecs=${bilan.echecs} erreurs=${bilan.erreurs}`);
  return new Response(JSON.stringify(bilan), { status: 200, headers: { 'content-type': 'application/json' } });
});
