// ---------------------------------------------------------------------------
// Bahaba – MongoDB Connection Client Singleton
// Caches connection pool in development across Next.js HMR reloads.
// ---------------------------------------------------------------------------

import dns from "node:dns";
import { MongoClient, Db, Collection, Document } from "mongodb";

// Fix for Windows / Node / Bun c-ares DNS resolving to localhost 127.0.0.1 for SRV records.
// IMPORTANT: Only apply this on Windows. In Linux / AWS Lambda / Vercel Serverless,
// overriding DNS with public servers breaks internal VPC DNS routing and causes all
// network and hostname lookups to fail or time out.
if (process.platform === "win32") {
  try {
    const currentServers = dns.getServers();
    if (!currentServers.length || currentServers.every((s) => s === "127.0.0.1" || s === "::1")) {
      dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
    }
  } catch {
    // Ignore in environments where setServers is restricted
  }
}

const uri = process.env.MONGODB_URI || "";
const defaultDbName = process.env.MONGODB_DB || "bahaba";

if (!uri) {
  console.warn("[MongoDB] ⚠️ MONGODB_URI environment variable is not defined.");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 10000,
};

/**
 * Lazily establishes and caches the MongoClient connection promise.
 * Works across both development HMR and Vercel serverless warm invocations.
 */
function getOrCreateClientPromise(): Promise<MongoClient> {
  if (!uri) {
    return Promise.reject(new Error("MONGODB_URI environment variable is not defined"));
  }

  if (global._mongoClientPromise) {
    return global._mongoClientPromise;
  }

  const client = new MongoClient(uri, mongoOptions);
  const promise = client.connect().catch((err) => {
    // Clear cache on connection failure so subsequent requests can retry
    global._mongoClientPromise = undefined;
    throw err;
  });

  global._mongoClientPromise = promise;
  return promise;
}

/**
 * Returns the connected MongoClient instance promise.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return getOrCreateClientPromise();
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

export default getOrCreateClientPromise;
