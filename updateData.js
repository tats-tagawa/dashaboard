import { connectDB, createAllTables, updateOperatorDataTable, updateOperators, updateAllOperators } from "./utils/postgres.js";

const db = connectDB();
await createAllTables(db);
await updateOperators(db);
await updateOperatorDataTable(db, "BA");
// await updateAllOperators(db);
process.exit(0);
