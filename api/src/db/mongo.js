import { MongoClient } from 'mongodb';
import { config } from '../config.js';

const client = new MongoClient(config.mongo.uri, {
  serverSelectionTimeoutMS: 5_000,
});

let connecting = null;

/** Returns the gigtask database, connecting on first use. */
export async function getMongoDb() {
  if (!connecting) {
    connecting = client.connect().catch((err) => {
      connecting = null; // allow a retry on the next request
      throw err;
    });
  }
  await connecting;
  return client.db(config.mongo.dbName);
}

export async function closeMongo() {
  await client.close();
}
