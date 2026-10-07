// Formatage des durées et des âges, en français.
import fr from '../i18n/fr.js';

// Durée courte : « 40 s », « 6 min », « 3 h », « 2 j ».
export function duree(secondes) {
  if (secondes === null || secondes === undefined || Number.isNaN(secondes)) return fr.commun.aucun;
  const s = Math.max(0, Math.round(secondes));
  if (s < 60) return fr.temps.s(s);
  if (s < 3600) return fr.temps.min(Math.floor(s / 60));
  if (s < 86400) return fr.temps.h(Math.floor(s / 3600));
  return fr.temps.j(Math.floor(s / 86400));
}

// Secondes écoulées depuis une date (ISO ou Date).
export function depuis(date, now = Date.now()) {
  if (!date) return null;
  return Math.max(0, (now - new Date(date).getTime()) / 1000);
}

// « il y a 40 s » (ou « à l'instant » sous 2 s).
export function ilYa(date, now = Date.now()) {
  const s = depuis(date, now);
  if (s === null) return fr.commun.aucun;
  if (s < 2) return fr.temps.maintenant;
  return fr.temps.ilYa(duree(s));
}

// Âge d'une ressource à partir de sa date de création.
export function age(date, now = Date.now()) {
  return duree(depuis(date, now));
}
