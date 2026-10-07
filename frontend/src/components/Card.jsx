// Carte : surface bordée des maquettes. « alert » = bordure rouge de 2 px.
export default function Card({ children, padded = false, alert = false, scroll = false, className = '', as: Tag = 'div', ...rest }) {
  const classes = ['card'];
  if (padded) classes.push('card-pad');
  if (alert) classes.push('card-alert');
  if (scroll) classes.push('card-scroll');
  if (className) classes.push(className);
  return (
    <Tag className={classes.join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
