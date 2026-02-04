import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to prevent browser caching of HTML navigation responses.
 *
 * Problem: When switching between dev (Turbopack) and production (webpack),
 * browsers can serve stale cached HTML that references chunk URLs from a
 * different build — causing 80+ 404s and a blank screen.
 *
 * This middleware ensures every HTML page response includes no-cache headers,
 * while allowing content-hashed static assets to be cached immutably.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Skip static assets — they use content hashes and should be cached
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/static/') ||
    pathname.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$/)
  ) {
    return response;
  }

  // All navigation/document requests: prevent caching
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  return response;
}

export const config = {
  // Run on all page routes but skip API routes and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|workers/).*)'],
};
