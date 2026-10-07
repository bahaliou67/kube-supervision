// Protections du serveur local.
//
// - hostGuard : toutes les routes refusent un en-tête Host qui n'est pas
//   l'adresse locale. Cela bloque les attaques par « DNS rebinding » (un site
//   malveillant qui ferait pointer son nom de domaine vers 127.0.0.1).
// - sameOrigin : les routes d'action (POST, DELETE) exigent que la requête
//   vienne de la page de l'outil lui-même (en-tête Origin identique à
//   l'adresse du serveur). Un autre site ouvert dans le navigateur ne peut
//   donc pas déclencher une action, même en connaissant l'adresse.
import { AppError } from './errors.js';

const HOTE_LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;

export function hostGuard(req, _res, next) {
  if (!HOTE_LOCAL.test(req.headers.host ?? '')) return next(new AppError(403, 'HOTE_REFUSE'));
  return next();
}

export function sameOrigin(req, _res, next) {
  const origine = req.headers.origin;
  const attendue = `http://${req.headers.host}`;
  if (!origine || origine.toLowerCase() !== attendue.toLowerCase()) return next(new AppError(403, 'ORIGINE_REFUSEE'));
  // Indice supplémentaire fourni par les navigateurs récents.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return next(new AppError(403, 'ORIGINE_REFUSEE'));
  return next();
}
