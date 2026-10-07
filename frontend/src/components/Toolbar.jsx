// Éléments de barre d'outils conçus pour les listes (absents des maquettes) :
// champ de recherche, filtre segmenté par statut, liste déroulante de type.
// Ils reprennent les champs et le groupe de boutons de l'écran des logs.
import Icon from './Icon.jsx';

export function SearchField({ value, onChange, label, placeholder, count, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <Icon name="recherche" size={14} />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      {count !== undefined && value ? <span className="small mut" style={{ whiteSpace: 'nowrap' }}>{count}</span> : null}
    </label>
  );
}

// Groupe de boutons exclusifs (aria-pressed), comme « Conteneur actuel / précédent ».
// options : [{ value, label, count?, icon?, tone? }]
export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={o.tone ? `seg-${o.tone}` : undefined}>
          {o.icon ? <Icon name={o.icon} size={14} /> : null}
          {o.label}
          {o.count !== undefined ? <span className="seg-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SelectField({ value, onChange, options, label }) {
  return (
    <label className="field select-field">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="bas" size={12} strokeWidth={2} />
    </label>
  );
}
