// Lecture du contexte (ctx) et du namespace (ns) communs à toutes les routes.
import { AppError } from '../errors.js';
import { bilingue } from '../messages.js';

// Libellés des paramètres vérifiés, pour le message d'erreur en anglais.
const LIBELLES_EN = { nom: 'name', 'nom de Pod': 'Pod name', 'nom de conteneur': 'container name' };

// Noms Kubernetes valides (RFC 1123), pour refuser tôt une saisie invalide.
const NOM_DNS = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export function validName(nom, quoi = 'nom') {
  if (typeof nom !== 'string' || nom.length === 0 || nom.length > 253 || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(nom)) {
    const valeur = String(nom).slice(0, 80);
    throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue(`${quoi} « ${valeur} »`, `${LIBELLES_EN[quoi] ?? quoi} "${valeur}"`) });
  }
  return nom;
}

// Renvoie { ctx, ns, k } où k contient les clients d'API du contexte.
export function scope(kube, req) {
  const ctx = kube.resolveContext(req.query.ctx || undefined).name;
  const ns = req.query.ns || kube.defaultNamespace(ctx);
  if (ns.length > 63 || !NOM_DNS.test(ns)) {
    throw new AppError(400, 'PARAMETRE_INVALIDE', { detail: bilingue(`namespace « ${ns.slice(0, 80)} »`, `namespace "${ns.slice(0, 80)}"`) });
  }
  return { ctx, ns, k: kube.clients(ctx) };
}
