import { connectDB, updateAllOperators } from "./utils/sqlite.js";

const db = connectDB();
await updateAllOperators(db);
process.exit(0);
