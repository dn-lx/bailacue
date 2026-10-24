import catalogue from '../../catalogue.json' with { type: 'json' };
import { createMediaHandler } from '../../drive-stream.mjs';
export default createMediaHandler(catalogue);
export const config = { path: '/api/drive-video/:fileId' };
