export const config = {
  matcher: '/(.*)',
};

export default async function middleware(request) {
  const hostname = request.headers.get('host') || '';

  if (hostname === 'claimiq.petclaimhelper.com' || hostname === 'www.claimiq.petclaimhelper.com') {
    const url = new URL('/api/claim-iq', request.url);
    const response = await fetch(url.toString());
    return new Response(response.body, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
