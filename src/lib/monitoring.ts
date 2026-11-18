// Crash reports via Sentry, when VITE_SENTRY_DSN is set. Errors only: no session replay or
// performance tracing, and no personal data, since which prayers someone attends is
// special-category data. Without a DSN this is a no-op.

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN?.trim();

export function initMonitoring(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    // Set by Vercel ("production" / "preview"), so preview-only errors are easy to tell apart.
    environment: import.meta.env.VITE_VERCEL_ENV ?? import.meta.env.MODE,
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA,
    // Only what's needed to debug: the error, stack trace, browser and page.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend(event) {
      if (event.request?.url) event.request.url = withoutFragment(event.request.url);
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.category === 'navigation' && crumb.data) {
        for (const key of ['from', 'to'] as const) {
          if (typeof crumb.data[key] === 'string') crumb.data[key] = withoutFragment(crumb.data[key]);
        }
      }
      return crumb;
    },
  });
}

/** Google sign-in returns the session tokens in the URL fragment; never send those. */
export function withoutFragment(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}
