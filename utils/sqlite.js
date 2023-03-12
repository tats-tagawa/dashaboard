import sqlite3 from 'sqlite3';
import * as dotenv from 'dotenv';
dotenv.config();
import { getOperators, getVehiclePositions } from './transit-data.js'

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
  db.run(`
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

function deleteOperators(db) {
  db.run('DELETE FROM operators');
}

async function createPositionsTable(db) {
  db.run(`
  CREATE TABLE positions
  (
    id TEXT PRIMARY KEY,
    operator TEXT,
    trip_id TEXT,
    vehicle_id TEXT,
    route_id TEXT,
    direction_id INT,
    latitude REAL,
    longitude REAL,
    bearing REAL,
    speed REAL
  )
  `)
}
const db = connectDB();