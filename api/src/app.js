import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { REPO_ROOT } from './config.js';
import { HttpError } from './lib/http.js';
import { translatePgError } from './lib/pgErrors.js';
import { analyticsRouter } from './routes/analytics.js';
import { clientsRouter } from './routes/clients.js';
import { contractsRouter } from './routes/contracts.js';
import { freelancersRouter } from './routes/freelancers.js';
import { gigsRouter } from './routes/gigs.js';
import { healthRouter } from './routes/health.js';
import { reviewsRouter } from './routes/reviews.js';
import { workersRouter } from './routes/workers.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/freelancers', freelancersRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/gigs', gigsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/reviews', reviewsRouter);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Unknown API endpoint')));

  // Production: serve the built front end (web/dist) from the same port.
  const dist = path.join(REPO_ROOT, 'web', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Every error leaves as { error: { code, message, details } }.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const known = err instanceof HttpError ? err : translatePgError(err);
    if (known) {
      return res.status(known.status).json({
        error: { code: known.code, message: known.message, details: known.details },
      });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
    }
    if (isConnectionError(err)) {
      const db = err.name?.startsWith('Mongo') ? 'MongoDB' : 'PostgreSQL';
      return res.status(503).json({
        error: { code: 'DATABASE_UNAVAILABLE', message: `${db} is not reachable. Is it running?` },
      });
    }
    if (err?.code === '42883' || err?.code === '42P01') {
      // undefined function / table: the fixes script was not run
      return res.status(500).json({
        error: {
          code: 'SCHEMA_INCOMPLETE',
          message: `Database object missing (${err.message}). Run the setup (db/sql/01-05 and db/sql/07_ui_support.sql).`,
        },
      });
    }
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
  });

  return app;
}

function isConnectionError(err) {
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '3D000', '28P01'].includes(err?.code) ||
    ['MongoServerSelectionError', 'MongoNetworkError', 'MongoNotConnectedError'].includes(err?.name)
  );
}
