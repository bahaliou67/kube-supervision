// Modification ciblée du modèle de Pod d'une charge de travail : image,
// variables d'environnement, ressources CPU et mémoire d'un conteneur ; et
// limites d'un autoscaler (HPA). Comme les autres actions, les modifications
// n'acceptent que des requêtes venant de la page de l'outil et sont
// journalisées sans valeur (une variable d'environnement peut être sensible).
//
// GET  /api/workloads/:type/:nom/containers                 conteneurs du modèle
// POST /api/workloads/:type/:nom/containers/:conteneur      corps : { image?, env?, resources? }
// POST /api/resources/horizontalpodautoscalers/:nom/limits  corps : { min, max }
import { Router } from 'express';
import * as k8s from '@kubernetes/client-node';
import { AppError, withTimeout } from '../errors.js';
import { sameOrigin } from '../security.js';
import { bilingue } from '../messages.js';
import { fusion, journal } from './actions.js';
import { scope, validName } from './scope.js';

// Types modifiables : lecture, modification, et chemin du modèle de Pod.
// Un Job ne peut pas être modifié (son modèle est immuable).
const TYPES = {
  deployments: { kind: 'Deployment', lire: 'readNamespacedDeployment', patcher: 'patchNamespacedDeployment', api: 'apps' },
  statefulsets: { kind: 'StatefulSet', lire: 'readNamespacedStatefulSet', patcher: 'patchNamespacedStatefulSet', api: 'apps' },
  daemonsets: { kind: 'DaemonSet', lire: 'readNamespacedDaemonSet', patcher: 'patchNamespacedDaemonSet', api: 'apps' },
  cronjobs: { kind: 'CronJob', lire: 'readNamespacedCronJob', patcher: 'patchNamespacedCronJob', api: 'batch', cronjob: true },
};

export const HPA_MAX = 1000;
const ENV_MAX = 200;
// Nom de variable d'environnement accepté par Kubernetes.
const NOM_ENV = /^[-._a-zA-Z][-._a-zA-Z0-9]*$/;
// Quantité Kubernetes : « 250m », « 0.5 », « 256Mi », « 1Gi », « 1e3 »…
export const QUANTITE = /^\+?(\d+(\.\d*)?|\.\d+)(([KMGTPE]i)|[numkMGTPE]|[eE][+-]?\d+)?$/;
const IMAGE = /^[^\s]{1,512}$/;

function typeDe(brut) {
  const t = TYPES[String(brut).toLowerCase()];
  if (!t) throw new AppError(400, 'ACTION_IMPOSSIBLE', { type: String(brut).slice(0, 40) });
  return t;
}

const modeleDe = (obj, t) => (t.cronjob ? obj.spec?.jobTemplate?.spec?.template : obj.spec?.template);

// Corps d'un patch du modèle de Pod (le chemin diffère pour un CronJob).
function envelopper(t, podSpec) {
  const template = { spec: podSpec };
  return t.cronjob ? { spec: { jobTemplate: { spec: { template } } } } : { spec: { template } };
}

// Origine d'une variable non littérale, sans jamais lire la valeur d'un Secret.
function source(v) {
  const f = v.valueFrom;
  if (!f) return null;
  if (f.configMapKeyRef) return { kind: 'ConfigMap', name: f.configMapKeyRef.name, key: f.configMapKeyRef.key };
  if (f.secretKeyRef) return { kind: 'Secret', name: f.secretKeyRef.name, key: f.secretKeyRef.key };
  if (f.fieldRef) return { kind: 'Field', name: f.fieldRef.fieldPath };
  if (f.resourceFieldRef) return { kind: 'Resource', name: f.resourceFieldRef.resource };
  return { kind: 'Autre' };
}

function mapConteneur(c, init) {
  const r = c.resources ?? {};
  return {
    name: c.name,
    init,
    image: c.image ?? null,
    env: (c.env ?? []).map((v) => ({ name: v.name, value: v.valueFrom ? null : v.value ?? '', source: source(v) })),
    envFrom: (c.envFrom ?? []).map((e) => ({
      kind: e.configMapRef ? 'ConfigMap' : e.secretRef ? 'Secret' : 'Autre',
      name: e.configMapRef?.name ?? e.secretRef?.name ?? null,
      prefix: e.prefix ?? null,
    })),
    resources: {
      requests: { cpu: r.requests?.cpu ?? null, memory: r.requests?.memory ?? null },
      limits: { cpu: r.limits?.cpu ?? null, memory: r.limits?.memory ?? null },
    },
  };
}

// Valide la partie « ressources » : { requests: { cpu, memory }, limits: { … } },
// chaque valeur étant une quantité, ou null pour la retirer.
function ressources(brut) {
  const sortie = {};
  for (const groupe of ['requests', 'limits']) {
    const g = brut?.[groupe];
    if (g === undefined) continue;
    sortie[groupe] = {};
    for (const cle of ['cpu', 'memory']) {
      const v = g?.[cle];
      if (v === undefined) continue;
      if (v !== null && (typeof v !== 'string' || !QUANTITE.test(v))) {
        throw new AppError(400, 'PARAMETRE_INVALIDE', {
          detail: bilingue(
            `${groupe}.${cle} « ${String(v).slice(0, 40)} » n'est pas une quantité Kubernetes`,
            `${groupe}.${cle} "${String(v).slice(0, 40)}" is not a Kubernetes quantity`,
          ),
        });
      }
      sortie[groupe][cle] = v;
    }
  }
  return sortie;
}

// Valide la partie « env » : { set: { NOM: valeur }, remove: [NOM] }.
function variables(brut) {
  const set = Object.entries(brut?.set ?? {});
  const remove = brut?.remove ?? [];
  if (!Array.isArray(remove) || set.length + remove.length > ENV_MAX) {
    throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue(`au plus ${ENV_MAX} variables à la fois`, `at most ${ENV_MAX} variables at a time`) });
  }
  for (const [nom, valeur] of set) {
    if (!NOM_ENV.test(nom)) throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue(`nom de variable « ${nom.slice(0, 60)} »`, `variable name "${nom.slice(0, 60)}"`) });
    if (typeof valeur !== 'string') throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue(`valeur de ${nom}`, `value of ${nom}`) });
  }
  for (const nom of remove) {
    if (typeof nom !== 'string' || !NOM_ENV.test(nom)) throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue(`nom de variable « ${String(nom).slice(0, 60)} »`, `variable name "${String(nom).slice(0, 60)}"`) });
  }
  // valueFrom: null retire une éventuelle référence (ConfigMap, Secret) remplacée par une valeur.
  return [...set.map(([name, value]) => ({ name, value, valueFrom: null })), ...remove.map((name) => ({ name, $patch: 'delete' }))];
}

export function conteneursRouter(kube) {
  const r = Router();

  r.get('/workloads/:type/:name/containers', async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const t = typeDe(req.params.type);
    const name = validName(req.params.name, 'nom');
    const obj = await withTimeout(k[t.api][t.lire]({ name, namespace: ns }));
    const spec = modeleDe(obj, t)?.spec ?? {};
    res.json({
      ctx,
      ns,
      kind: t.kind,
      name,
      containers: [...(spec.initContainers ?? []).map((c) => mapConteneur(c, true)), ...(spec.containers ?? []).map((c) => mapConteneur(c, false))],
    });
  });

  // Patch « strategic merge » : les conteneurs et les variables sont repérés
  // par leur nom, le reste du modèle n'est pas touché.
  r.post('/workloads/:type/:name/containers/:container', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const t = typeDe(req.params.type);
    const name = validName(req.params.name, 'nom');
    const conteneur = validName(req.params.container, 'nom de conteneur');
    const { image, env, resources } = req.body ?? {};
    if (image === undefined && env === undefined && resources === undefined) {
      throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue('aucune modification demandée', 'no change requested') });
    }

    const patchC = { name: conteneur };
    const changements = [];
    if (image !== undefined) {
      if (typeof image !== 'string' || !IMAGE.test(image)) throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: 'image' });
      patchC.image = image;
      changements.push(`image ${image}`);
    }
    if (env !== undefined) {
      patchC.env = variables(env);
      changements.push(`${patchC.env.length} variable(s) d'environnement`);
    }
    if (resources !== undefined) {
      patchC.resources = ressources(resources);
      changements.push('ressources CPU/mémoire');
    }

    // Le conteneur doit exister : sinon le patch en créerait un nouveau.
    const obj = await withTimeout(k[t.api][t.lire]({ name, namespace: ns }));
    const spec = modeleDe(obj, t)?.spec ?? {};
    const liste = (spec.containers ?? []).some((c) => c.name === conteneur)
      ? 'containers'
      : (spec.initContainers ?? []).some((c) => c.name === conteneur)
        ? 'initContainers'
        : null;
    if (!liste) throw new AppError(404, 'CONTENEUR_ABSENT', { container: conteneur, kind: t.kind, name });

    await withTimeout(
      k[t.api][t.patcher]({ name, namespace: ns, body: envelopper(t, { [liste]: [patchC] }) }, k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.StrategicMergePatch)),
    );
    journal(ctx, ns, `modification de ${t.kind} ${name}, conteneur ${conteneur} : ${changements.join(', ')}`);
    res.json({ ok: true, kind: t.kind, name, container: conteneur });
  });

  r.post('/resources/horizontalpodautoscalers/:name/limits', sameOrigin, async (req, res) => {
    const { ctx, ns, k } = scope(kube, req);
    const name = validName(req.params.name, 'nom');
    const { min, max } = req.body ?? {};
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > HPA_MAX) {
      throw new AppError(400, 'LIMITES_HPA_INVALIDES', { max: HPA_MAX });
    }
    await withTimeout(k.autoscaling.patchNamespacedHorizontalPodAutoscaler({ name, namespace: ns, body: { spec: { minReplicas: min, maxReplicas: max } } }, fusion()));
    journal(ctx, ns, `limites de HorizontalPodAutoscaler ${name} : ${min} à ${max} réplicas`);
    res.json({ ok: true, kind: 'HorizontalPodAutoscaler', name, min, max });
  });

  return r;
}
