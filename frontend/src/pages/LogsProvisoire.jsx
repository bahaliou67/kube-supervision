// Écran des logs : provisoire, remplacé à l'étape 5.
import { Breadcrumb } from './PodDetail.jsx';
import fr from '../i18n/fr.js';

export default function LogsProvisoire({ name }) {
  return (
    <main className="page page-detail">
      <Breadcrumb name={name} extra={fr.logs.titreCourt} />
      <p className="mut">{fr.logs.provisoire}</p>
    </main>
  );
}
