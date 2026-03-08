import { connectDB, updateOperatorDataTable, updateOperators, updateAllOperators } from "./utils/sqlite.js";

const db = connectDB();
await updateOperators(db);
await updateOperatorDataTable(db, "PG");
// await updateAllOperators(db);
process.exit(0);
