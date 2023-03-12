import sqlite3 from 'sqlite3';
import * as dotenv from 'dotenv';
dotenv.config();
import { getOperators } from './transit-data.js'

function connectDB() {
  const db = new sqlite3.Database('dashaboard.db', (error) => {
    if (error) {
      console.error(error.message);
    }
  });
  console.log("Connected to dashaboard.db");
  return db
}

function createOperatorsTable(db) {
  db.exec(`
  CREATE TABLE operators
  (
    id TEXT PRIMARY KEY,
    name TEXT
  )
  `);
}
