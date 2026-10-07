// Flux de logs en suivi (follow=true), ouvert directement plutôt que par la
// classe Log de @kubernetes/client-node : celle-ci ne transmet pas les erreurs
// de son flux interne, et l'interruption volontaire du suivi (navigateur
// fermé) faisait tomber le serveur. Ici, chaque erreur est captée.
import { Readable } from 'node:stream';
import * as k8s from '@kubernetes/client-node';
import { fetch } from 'undici';

// Ouvre le flux. Renvoie { stream, abort }. Lève une ApiException (code HTTP
// et corps Kubernetes) si le cluster refuse la requête.
export async function openLogStream(kc, { namespace, pod, container, sinceTime, sinceSeconds }) {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new Error('Aucun cluster actif dans le contexte');
  const url = new URL(`${cluster.server.replace(/\/$/, '')}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log`);
  url.searchParams.set('container', container);
  url.searchParams.set('follow', 'true');
  url.searchParams.set('timestamps', 'true');
  if (sinceTime) url.searchParams.set('sinceTime', sinceTime);
  else if (sinceSeconds) url.searchParams.set('sinceSeconds', String(sinceSeconds));

  // Authentification identique aux autres appels (jeton, certificat, commande externe, OIDC).
  const ctx = new k8s.RequestContext(url.toString(), k8s.HttpMethod.GET);
  await kc.applySecurityAuthentication(ctx);

  const controleur = new AbortController();
  const reponse = await fetch(url.toString(), {
    method: 'GET',
    headers: ctx.getHeaders(),
    dispatcher: ctx.getDispatcher(),
    signal: controleur.signal,
  });
  if (reponse.status !== 200 || !reponse.body) {
    const corps = await reponse.text().catch(() => '');
    throw new k8s.ApiException(reponse.status, 'Lecture des logs refusée', corps, {});
  }
  const stream = Readable.fromWeb(reponse.body);
  // Une interruption volontaire produit une AbortError : elle est attendue.
  stream.on('error', () => {});
  return {
    stream,
    abort: () => {
      controleur.abort();
      stream.destroy();
    },
  };
}
