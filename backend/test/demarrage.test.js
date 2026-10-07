// Tests du démarrage : port, port occupé, service du front compilé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PORT_PAR_DEFAUT, portDepuis, start } from '../src/index.js';
import { fakeGateway } from './fake-kube.js';

test('port : option --port, puis variable d’environnement, puis 7420', () => {
  assert.equal(portDepuis([], {}), PORT_PAR_DEFAUT);
  assert.equal(portDepuis([], { KUBE_SUPERVISION_PORT: '8100' }), 8100);
  assert.equal(portDepuis(['--port', '8200'], { KUBE_SUPERVISION_PORT: '8100' }), 8200);
  assert.equal(portDepuis(['--port=8300'], {}), 8300);
  assert.throws(() => portDepuis(['--port', 'abc'], {}), /Port invalide/);
  assert.throws(() => portDepuis(['--port', '70000'], {}), /Port invalide/);
});

test('port déjà occupé : le démarrage échoue avec EADDRINUSE (pas de démarrage silencieux)', async () => {
  const occupant = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => occupant.once('listening', r));
  const { port } = occupant.address();
  try {
    await assert.rejects(start({ port }), (err) => err.code === 'EADDRINUSE');
  } finally {
    occupant.close();
  }
});

test('démarrage : écoute uniquement sur 127.0.0.1, arrêt propre', async () => {
  const instance = await start({ port: 0 });
  try {
    assert.equal(instance.server.address().address, '127.0.0.1');
  } finally {
    await instance.stop();
  }
  assert.equal(instance.server.listening, false);
});

test('mode production : le front compilé est servi sur le même port, avec les en-têtes de sécurité', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'ks-front-'));
  mkdirSync(join(dossier, 'assets'));
  writeFileSync(join(dossier, 'index.html'), '<!doctype html><title>Supervision</title>');
  writeFileSync(join(dossier, 'assets', 'index-abc123.js'), 'console.log(1)');
  try {
    const app = createApp({ kube: fakeGateway({}), staticDir: dossier });
    const page = await request(app).get('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /Supervision/);
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.headers['cache-control'], 'no-cache');
    const script = await request(app).get('/assets/index-abc123.js');
    assert.match(script.headers['cache-control'], /immutable/);
    // L'API reste servie sur le même port.
    assert.equal((await request(app).get('/api/contexts')).status, 200);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
