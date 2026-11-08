// Paid Cloudflare Stream ingestion is retired for BailaCue's free local-FFmpeg workflow.
// Keep the old route explicitly disabled to avoid accidentally incurring conversion fees.
// Playback of any preexisting validated Stream metadata remains backwards compatible.
export default async function retiredStreamEndpoint() {
  return Response.json({ enabled: false, error: 'Paid Stream conversion is disabled. Use the free local FFmpeg studio and Google Drive optimized copies.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
export const config = { path: '/api/stream/:action' };
