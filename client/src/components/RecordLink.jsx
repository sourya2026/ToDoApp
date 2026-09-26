// =============================================================================
// RecordLink  -  the ONLY way a record is linked in this app.
//
// - real <a> (keyboard, screen reader, middle-click, open in new tab, copy link)
// - permission-aware: no access means plain text, never a link to a 403 page
// - stops click propagation, so a link inside a clickable row navigates once
// - unknown entity type throws, because a silent '#' is itself a dead end
// =============================================================================
import { Link } from 'react-router-dom';
import { ENTITY_ROUTES, linkTo } from '../lib/entityRoutes.js';
import { useSession } from '../lib/auth.jsx';

export function RecordLink({ type, id, children, className = '', title }) {
  const { can } = useSession();
  const route = ENTITY_ROUTES[type];
  if (!route) throw new Error('RecordLink: unknown entity type "' + type + '"');

  const label = children ?? '';

  // No id, or no permission: show the text, do not offer a link that 404s.
  // A null permission means "no extra check" - see the note in entityRoutes.js.
  const allowed = route.permission === null || can(route.permission, {});
  if (!id || !allowed) {
    return <span className={'record-plain ' + className} title={title}>{label}</span>;
  }

  return (
    <Link
      to={linkTo(type, id)}
      data-record-link={type}
      className={'record-link ' + className}
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}

/**
 * A reference straight from the API's { type, id, label } shape.
 * `fallback` is shown when the reference is null (e.g. Secondary = "Team").
 */
export function Ref({ reference, fallback = '', className }) {
  if (!reference) return <span className={'record-plain ' + (className || '')}>{fallback}</span>;
  return (
    <RecordLink type={reference.type} id={reference.id} className={className}>
      {reference.label}
    </RecordLink>
  );
}
