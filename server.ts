import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import express from 'express';
import { attachSocketServer } from './server/index';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  // Attach authoritative 60Hz Socket.IO volleyball server
  attachSocketServer(httpServer);

  expressApp.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', game: 'Volley Khelo', tickRate: 60 });
  });

  // Express 5 compatible catch-all route for Next.js
  expressApp.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Volley Khelo server + Socket.IO ready on http://${hostname}:${port}`);
  });
});
