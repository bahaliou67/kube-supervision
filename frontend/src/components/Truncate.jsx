// Nom tronqué avec points de suspension ; le nom complet s'affiche au survol.
export default function Truncate({ children, max, className = '', as: Tag = 'span', ...rest }) {
  const texte = typeof children === 'string' ? children : undefined;
  return (
    <Tag className={`trunc ${className}`} style={max ? { maxWidth: max } : undefined} title={texte} {...rest}>
      {children}
    </Tag>
  );
}
