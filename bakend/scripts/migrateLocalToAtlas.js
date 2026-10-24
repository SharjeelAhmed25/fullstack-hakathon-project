import "dotenv/config";
import dns from "node:dns";
import { MongoClient } from "mongodb";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

function parseUri(uri, label) {
  if (!uri) throw new Error(`${label} is required in bakend/.env.`);
  const normalized = uri
    .replace(/^mongodb\+srv:\/\//, "https://")
    .replace(/^mongodb:\/\//, "http://");
  const parsed = new URL(normalized);
  return {
    host: parsed.hostname,
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "")
  };
}

const sourceUri = process.env.LOCAL_MONGODB_URI;
const targetUri = process.env.MONGODB_URI;
const source = parseUri(sourceUri, "LOCAL_MONGODB_URI");
const target = parseUri(targetUri, "MONGODB_URI");

if (!["127.0.0.1", "localhost"].includes(source.host)) {
  throw new Error("LOCAL_MONGODB_URI must point to the local MongoDB server.");
}
if (!target.host.endsWith(".mongodb.net")) {
  throw new Error("MONGODB_URI must point to your existing MongoDB Atlas cluster.");
}
if (!source.database || source.database !== target.database) {
  throw new Error("Local and Atlas URIs must use the same database name.");
}

const sourceClient = new MongoClient(sourceUri);
const targetClient = new MongoClient(targetUri);

try {
  await Promise.all([sourceClient.connect(), targetClient.connect()]);
  const sourceDb = sourceClient.db(source.database);
  const targetDb = targetClient.db(target.database);
  const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
  let totalInserted = 0;

  for (const { name } of collections.filter(({ name }) => !name.startsWith("system."))) {
    const sourceCollection = sourceDb.collection(name);
    const targetCollection = targetDb.collection(name);
    const indexes = (await sourceCollection.indexes()).filter(({ name: indexName }) => indexName !== "_id_");
    if (indexes.length) {
      await targetCollection.createIndexes(indexes.map((index) => ({
        key: index.key,
        name: index.name,
        ...(index.unique ? { unique: true } : {}),
        ...(index.sparse ? { sparse: true } : {}),
        ...(index.expireAfterSeconds !== undefined ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
        ...(index.partialFilterExpression ? { partialFilterExpression: index.partialFilterExpression } : {}),
        ...(index.collation ? { collation: index.collation } : {})
      })));
    }

    let inserted = 0;
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const result = await targetCollection.bulkWrite(batch.map((document) => ({
        updateOne: {
          filter: { _id: document._id },
          update: { $setOnInsert: document },
          upsert: true
        }
      })), { ordered: true });
      inserted += result.upsertedCount;
      batch = [];
    };

    for await (const document of sourceCollection.find({})) {
      batch.push(document);
      if (batch.length === 250) await flush();
    }
    await flush();
    totalInserted += inserted;
    console.log(`${name}: ${inserted} new document(s) copied.`);
  }

  console.log(`Migration complete: ${totalInserted} new document(s) copied. Existing Atlas documents were not overwritten.`);
} catch (error) {
  console.error("Atlas migration stopped. Already copied documents are safe to retry:", error.message);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([sourceClient.close(), targetClient.close()]);
}
