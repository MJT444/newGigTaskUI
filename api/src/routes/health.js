import { Router } from 'express';
import { query } from '../db/postgres.js';
import { getMongoDb } from '../db/mongo.js';

export const healthRouter = Router();

// GET /api/health - each database checked separately, so the UI can say
// "MongoDB is down" while PostgreSQL screens keep working.
healthRouter.get('/', async (_req, res) => {
  const check = async (fn) => {
    try {
      await fn();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  const [postgres, mongo] = await Promise.all([
    check(() => query('SELECT 1')),
    check(async () => (await getMongoDb()).command({ ping: 1 })),
  ]);

  res.status(postgres.ok && mongo.ok ? 200 : 503).json({ postgres, mongo });
});
