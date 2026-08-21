// ---------------------------------------------------------------------------
// Bahaba – MongoDB Connection Client Singleton
// Caches connection pool in development across Next.js HMR reloads.
// ---------------------------------------------------------------------------

import { MongoClient, Db, Collection, Document } from "mongodb";

const uri = process.env.MONGODB_URI || "";
const defaultDbName = process.env.MONGODB_DB || "bahaba";

if (!uri) {
  console.warn("[MongoDB] ⚠️ MONGODB_URI environment variable is not defined.");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    if (uri) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    } else {
      global._mongoClientPromise = Promise.reject(new Error("MONGODB_URI is not set"));
    }
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  if (uri) {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  } else {
    clientPromise = Promise.reject(new Error("MONGODB_URI is not set"));
  }
}

/**
 * Returns the connected MongoClient instance promise.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

/**
 * Returns the MongoDB Database instance.
 */
export async function getDb(dbName: string = defaultDbName): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}

/**
 * Returns a typed MongoDB Collection instance.
 */
export async function getCollection<T extends Document = Document>(
  collectionName: string,
  dbName: string = defaultDbName
): Promise<Collection<T>> {
  const db = await getDb(dbName);
  return db.collection<T>(collectionName);
}

export default clientPromise;
