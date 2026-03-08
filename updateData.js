import { connectDB, updateOperatorDataTable, updateAllOperators } from "./utils/sqlite.js";

const db = connectDB();
await updateOperatorDataTable(db, "CT");
// await updateAllOperators(db);
process.exit(0);
