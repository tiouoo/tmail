import config from "../../config.js";
import { database, migrate } from "../worker/database.js";
const db = await database(process.env);
try {
  await migrate(db);
  console.log(`${config.name} database tables ready.`);
} catch (error) {
  console.error("Database migration failed:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  db.close();
}
