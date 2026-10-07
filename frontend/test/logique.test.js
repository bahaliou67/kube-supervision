// Tests de la logique du front qui ne dépend pas de l'affichage :
// statuts, diagnostic, regroupement des Pods, événements, estimations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusInfo, explication } from '../src/lib/status.js';
import { dernierArret, estIncident, libelleArret, phrase, quantite } from '../src/lib/diagnostic.js';
import { badgeReplicas, decouperImage, lignesCharges, resumeTypes } from '../src/lib/workloads.js';
import { phraseEvenement } from '../src/lib/events.js';
import { delaiBackoff, prochainRedemarrage } from '../src/lib/restart.js';
import { duree } from '../src/lib/format.js';

const p = (extra) => ({ name: 'web-1', uid: 'u1', status: 'Running', category: 'ok', containers: [], initContainers: [], restarts: 0, ...extra });

test('un statut a toujours une icône et un libellé (jamais la couleur seule)', () => {
  for (const [s, c] of [['Running', 'ok'], ['Pending', 'attente'], ['CrashLoopBackOff', 'erreur'], ['OOMKilled', 'erreur'], ['Terminating', 'arret'], ['Bizarre', 'erreur']]) {
    const i = statusInfo(s, c);
    assert.ok(i.icon, s);
    assert.equal(i.label, s);
    assert.ok(i.explication.length > 5, s);
  }
  assert.equal(statusInfo('CrashLoopBackOff', 'erreur').icon, 'boucle');
  assert.equal(statusInfo('OOMKilled', 'erreur').icon, 'memoire');
});

test('explication en langage simple, terme Kubernetes conservé à côté', () => {
  assert.match(explication('OOMKilled', 'erreur'), /^Mémoire dépassée/);
  assert.match(explication('Init:0/2', 'attente'), /0 sur 2/);
  assert.match(explication('ExitCode:3', 'erreur'), /code de sortie 3/);
  assert.equal(explication('RaisonInconnue', 'erreur'), 'Statut rapporté par Kubernetes.');
});

test('diagnostic d’un Pod qui plante après un OOMKilled', () => {
  const pod = p({
    status: 'CrashLoopBackOff',
    category: 'erreur',
    statusContainer: 'api',
    containers: [
      {
        name: 'api',
        limits: { memory: '192Mi' },
        state: { state: 'waiting', reason: 'CrashLoopBackOff' },
        lastState: { state: 'terminated', reason: 'OOMKilled', exitCode: 137, finishedAt: '2026-10-07T10:00:00Z' },
      },
    ],
  });
  assert.equal(phrase(pod).modele, 'Le conteneur {c} plante puis redémarre en boucle.');
  const t = dernierArret(pod);
  assert.equal(t.reason, 'OOMKilled');
  assert.equal(t.limite, '192 Mi');
  assert.equal(libelleArret(t), 'mémoire dépassée');
  assert.equal(estIncident({ reason: 'Completed', exitCode: 0 }), false);
  assert.equal(quantite('1Gi'), '1 Gi');
});

test('regroupement : Pods par charge, propriétaire inconnu, Pods sans propriétaire', () => {
  const workloads = [
    { kind: 'Deployment', name: 'web', desired: 2, ready: 1, images: ['web:2'] },
    { kind: 'CronJob', name: 'nuit', images: [] },
    { kind: 'Job', name: 'nuit-1', cronJob: 'nuit', images: [] },
  ];
  const pods = [
    p({ uid: 'a', name: 'web-a', workload: { kind: 'Deployment', name: 'web' } }),
    p({ uid: 'b', name: 'web-b', category: 'erreur', status: 'Error', workload: { kind: 'Deployment', name: 'web' } }),
    p({ uid: 'c', name: 'perso-1', workload: { kind: 'MonOperateur', name: 'perso' } }),
    p({ uid: 'd', name: 'seul', workload: null }),
  ];
  const lignes = lignesCharges(workloads, pods);
  const parCle = Object.fromEntries(lignes.map((l) => [l.key, l]));
  assert.equal(parCle['Deployment/web'].pods.length, 2);
  assert.equal(parCle['Deployment/web'].category, 'erreur');
  assert.equal(parCle['MonOperateur/perso'].synthetic, true);
  assert.equal(parCle.__orphelins__.pods[0].name, 'seul');
  assert.equal(parCle['Job/nuit-1'], undefined, 'Job d’un CronJob rattaché au CronJob');
  assert.equal(badgeReplicas(parCle['Deployment/web']).texte, '1/2 · 1 en erreur');
  assert.equal(resumeTypes(lignes), '1 Deployment · 1 CronJob · 1 Pod sans propriétaire');
});

test('image et version', () => {
  assert.deepEqual(decouperImage('registre:5000/equipe/api:1.2'), { nom: 'registre:5000/equipe/api', version: '1.2', digest: undefined });
  assert.equal(decouperImage('nginx').version, 'latest');
});

test('événements traduits ; raison inconnue sans traduction inventée', () => {
  assert.match(phraseEvenement({ reason: 'Unhealthy', message: 'Readiness probe failed: HTTP probe failed with statuscode: 503' }), /HTTP 503/);
  assert.match(phraseEvenement({ reason: 'Unhealthy', message: 'Liveness probe failed: timeout' }), /test de vie/);
  assert.match(phraseEvenement({ reason: 'Scheduled', message: 'Successfully assigned ns/p to noeud-7' }), /noeud-7/);
  assert.equal(phraseEvenement({ reason: 'RaisonMaison', message: 'x' }), null);
});

test('estimation du prochain redémarrage (CrashLoopBackOff)', () => {
  assert.equal(delaiBackoff(1), 10);
  assert.equal(delaiBackoff(3), 40);
  assert.equal(delaiBackoff(20), 300);
  const now = Date.parse('2026-10-07T10:00:40Z');
  const c = { restarts: 6, state: { state: 'waiting', reason: 'CrashLoopBackOff' }, lastState: { finishedAt: '2026-10-07T10:00:00Z' } };
  assert.equal(prochainRedemarrage(c, now), 260); // 5 min plafonnées − 40 s écoulées
  assert.equal(prochainRedemarrage({ state: { state: 'running' } }, now), null);
});

test('durées', () => {
  assert.equal(duree(40), '40 s');
  assert.equal(duree(360), '6 min');
  assert.equal(duree(3 * 3600), '3 h');
});
