// Galerie des composants de base (#/composants), disponible uniquement en
// développement pour vérifier le rendu dans les deux thèmes. Les textes de
// cette page sont des exemples de démonstration, pas des données du cluster.
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Truncate from '../components/Truncate.jsx';
import { Skeleton } from '../components/States.jsx';
import { explication } from '../lib/status.js';

const STATUTS = [
  ['Running', 'ok'],
  ['Running', 'attente'],
  ['Pending', 'attente'],
  ['ContainerCreating', 'attente'],
  ['Init:0/2', 'attente'],
  ['CrashLoopBackOff', 'erreur'],
  ['OOMKilled', 'erreur'],
  ['ImagePullBackOff', 'erreur'],
  ['CreateContainerConfigError', 'erreur'],
  ['Error', 'erreur'],
  ['Terminating', 'arret'],
  ['Completed', 'termine'],
];

export default function Galerie() {
  return (
    <main className="page">
      <h1>Composants</h1>
      <section className="section">
        <h2>Badges de statut</h2>
        <Card padded style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '12px 18px', alignItems: 'center' }}>
          {STATUTS.map(([s, c]) => (
            <div key={`${s}-${c}`} style={{ display: 'contents' }}>
              <div>
                <StatusBadge status={s} category={c} />
              </div>
              <span className="mut" style={{ fontSize: 13 }}>{explication(s, c)}</span>
              <StatusBadge status={s} category={c} plain />
            </div>
          ))}
        </Card>
      </section>
      <section className="section">
        <h2>Boutons</h2>
        <Card padded style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary">Voir la fiche</Button>
          <Button>Voir les logs</Button>
          <Button variant="danger-outline" icon="corbeille">
            Supprimer le Pod
          </Button>
          <Button variant="danger" size="lg">
            Supprimer le Pod
          </Button>
          <Button size="sm">Redémarrer</Button>
          <Button size="sm" disabledReason="Vos droits ne permettent pas de redémarrer cette charge de travail (patch deployments refusé).">
            Redémarrer
          </Button>
          <Button variant="warn-outline">Réessayer</Button>
        </Card>
      </section>
      <section className="section">
        <h2>Cartes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card padded>Carte standard</Card>
          <Card padded alert>
            Carte d&apos;alerte
          </Card>
        </div>
      </section>
      <section className="section">
        <h2>Nom long tronqué</h2>
        <Card padded>
          <Truncate className="mono" max={260}>
            un-nom-de-ressource-extremement-long-genere-par-un-operateur-7d9f8b6c5-m8ztw
          </Truncate>
        </Card>
      </section>
      <section className="section">
        <h2>Chargement</h2>
        <Card padded>
          <Skeleton />
        </Card>
      </section>
    </main>
  );
}
