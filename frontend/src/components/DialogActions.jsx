// Pied et message d'erreur communs aux fenêtres de confirmation des actions.
import Icon, { Spinner } from './Icon.jsx';
import fr from '../i18n/fr.js';

const A = fr.actions;

export function Boutons({ onCancel, onConfirm, busy, label, danger, disabled, annulerRef }) {
  return (
    <div className="dialog-actions">
      <button ref={annulerRef} type="button" className="btn btn-lg btn-quiet" onClick={onCancel} disabled={busy}>
        {A.annuler}
      </button>
      <button type="button" className={`btn btn-lg ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy || disabled} aria-busy={busy}>
        {busy ? (
          <>
            <Spinner size={14} /> {A.enCours}
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

export function Erreur({ erreur }) {
  if (!erreur) return null;
  return (
    <div className="field-error dialog-error" role="alert">
      <Icon name="alerte" size={14} />
      <span>
        {A.echec}
        {erreur.message}
      </span>
    </div>
  );
}
