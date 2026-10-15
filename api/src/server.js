import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/postgres.js';
import { closeMongo } from './db/mongo.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`GigTask API listening on http://localhost:${config.port}`);
  console.log(`  PostgreSQL ${config.pg.user}@${config.pg.host}:${config.pg.port}/${config.pg.database}`);
  console.log(`  MongoDB    ${config.mongo.uri} (db: ${config.mongo.dbName})`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([pool.end(), closeMongo()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
