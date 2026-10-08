// Les deux dictionnaires (fr.js, en.js) doivent rester alignés : mêmes clés,
// mêmes types, et mêmes {variables} dans chaque texte, sans quoi un écran
// afficherait un texte manquant ou un gabarit non rempli dans une langue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';
import textes, { langue, locale } from '../src/i18n/index.js';

const variables = (texte) => [...new Set(String(texte).match(/\{\w+\}/g) ?? [])].sort();

// Parcourt fr et en en parallèle et renvoie la liste des écarts.
function ecarts(a, b, chemin = '') {
  const liste = [];
  const type = (v) => (Array.isArray(v) ? 'array' : typeof v);
  if (type(a) !== type(b)) return [`${chemin} : ${type(a)} en français, ${type(b)} en anglais`];
  if (type(a) === 'object') {
    for (const cle of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(cle in b)) liste.push(`${chemin}.${cle} : absent en anglais`);
      else if (!(cle in a)) liste.push(`${chemin}.${cle} : absent en français`);
      else liste.push(...ecarts(a[cle], b[cle], `${chemin}.${cle}`));
    }
    return liste;
  }
  if (type(a) === 'array') {
    if (a.length !== b.length) return [`${chemin} : ${a.length} éléments en français, ${b.length} en anglais`];
    return a.flatMap((x, i) => ecarts(x, b[i], `${chemin}[${i}]`));
  }
  if (type(a) === 'function') {
    if (a.length !== b.length) return [`${chemin} : ${a.length} paramètre(s) en français, ${b.length} en anglais`];
    // Appel avec des valeurs d'exemple (chaînes, pour les fonctions qui en manipulent).
    const args = Array.from({ length: a.length }, () => '3');
    return ecarts(a(...args), b(...args), `${chemin}()`);
  }
  if (type(a) === 'string' && variables(a).join() !== variables(b).join()) {
    return [`${chemin} : variables ${variables(a).join(' ') || '(aucune)'} en français, ${variables(b).join(' ') || '(aucune)'} en anglais`];
  }
  return liste;
}

test('le dictionnaire anglais a les mêmes clés, types et variables que le français', () => {
  assert.deepEqual(ecarts(fr, en), []);
});

test('aucun texte anglais vide', () => {
  const vides = [];
  const parcourir = (o, chemin) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') parcourir(v, `${chemin}.${k}`);
      else if (v === '') vides.push(`${chemin}.${k}`);
    }
  };
  parcourir(en, '');
  // Seuls les détails volontairement vides en français le sont aussi en anglais.
  assert.deepEqual(vides, ['.arrets.DeadlineExceeded.detail', '.arrets.defaut.detail']);
});

test('hors navigateur (tests), l’interface est en français', () => {
  assert.equal(langue, 'fr');
  assert.equal(locale, 'fr-FR');
  assert.equal(textes, fr);
});
