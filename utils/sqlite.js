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

async function updateOperators(db) {
  const data = await getOperators();
  data.forEach((operator) => {
    console.log(operator);
    const operatorData = [operator.Id, operator.Name]
    console.log(operatorData)
    db.run('INSERT INTO operators(id, name) VALUES (?, ?)', operatorData, (error) => {
      if (error) {
        console.error(error.message);
      } else {
        console.log(`Inserted ${operator.Name} (${operator.Id})`);
      }
    });
  });
}

const db = connectDB();
updateOperators(db);