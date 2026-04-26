/**
 * Shown while a route segment is pending (RSC + client bundle).
 * Used by `app/(app)/loading.tsx` and the app layout Suspense fallback.
 */
export function RouteLoadingIndicator() {
    return (
        <div className="page-loading" aria-hidden>
            <div className="page-loading__bar" />
            <div className="page-loading__content" />
        </div>
    );
}
