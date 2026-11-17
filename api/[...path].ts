
import type { IncomingMessage, ServerResponse } from 'node:http';
import { appPromise } from '../server.ts';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error('FYOORA API initialization failed:', error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }

    return res.end(JSON.stringify({
      error: 'FYOORA API initialization failed.',
    }));
  }
}
