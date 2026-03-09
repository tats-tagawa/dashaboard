import { connectDB, createAllTables, updateOperatorDataTable, updateOperators, updateAllOperators } from "./utils/postgres.js";

const db = connectDB();
// await createAllTables(db);
// await updateOperators(db);
await updateOperatorDataTable(db, "EE");
await updateOperatorDataTable(db, "SM");
await updateOperatorDataTable(db, "ST");
await updateOperatorDataTable(db, "WC");
// await updateAllOperators(db);
process.exit(0);
