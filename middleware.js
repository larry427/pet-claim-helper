export const config = {
  matcher: '/(.*)',
};

export default function middleware(request) {
  const hostname = request.headers.get('host') || '';

  if (hostname === 'claimiq.petclaimhelper.com' || hostname === 'www.claimiq.petclaimhelper.com') {
    return fetch(new URL('/api/claim-iq', request.url));
  }

  // For all other hosts, continue normally (serves the PCH React app)
  return undefined;
}
