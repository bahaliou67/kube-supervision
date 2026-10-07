// Transformation des événements Kubernetes (core/v1 Event) pour l'écran.

// Date la plus pertinente d'un événement, selon les champs remplis par
// les différentes versions de Kubernetes.
function dateEvenement(e) {
  return e.lastTimestamp ?? e.series?.lastObservedTime ?? e.eventTime ?? e.firstTimestamp ?? e.metadata?.creationTimestamp ?? null;
}

export function mapEvent(e) {
  return {
    uid: e.metadata?.uid ?? `${e.reason}-${dateEvenement(e)}`,
    type: e.type === 'Warning' ? 'Warning' : 'Normal',
    reason: e.reason ?? null,
    message: e.message ?? '',
    count: e.series?.count ?? e.count ?? 1,
    lastAt: dateEvenement(e),
    firstAt: e.firstTimestamp ?? e.eventTime ?? null,
    source: e.source?.component ?? e.reportingComponent ?? null,
  };
}

// Événements d'un objet, du plus récent au plus ancien. Si l'uid est connu,
// on écarte ceux d'un ancien objet du même nom (Pod de StatefulSet recréé).
export function eventsFor(events, uid) {
  return (events ?? [])
    .filter((e) => !uid || !e.involvedObject?.uid || e.involvedObject.uid === uid)
    .map(mapEvent)
    .sort((a, b) => new Date(b.lastAt ?? 0) - new Date(a.lastAt ?? 0));
}
