import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

console.log("Running migrations...");

try {
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Migrations applied successfully!");
} catch (err) {
  console.error("Migrations failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
