// The loading.tsx fallback of a route segment: shown at once when a
// navigation goes to a page that still has to come from the server (dynamic
// routes, or a prefetch that has not finished), inside the shell that stays.
// It fades in after a beat, so a fast navigation never flashes it.
export default function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-busy="true">
      <span className="rf__spinner" aria-hidden="true" />
    </div>
  );
}
