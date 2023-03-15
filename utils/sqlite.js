import sqlite3 from "sqlite3";
import * as dotenv from "dotenv";
dotenv.config();
import {
  getOperators,
  getVehiclePositions,
  getOperatorData,
} from "./transit-data.js";

function connectDB() {
  const db = new sqlite3.Database("dashaboard.db", (error) => {
    if (error) {
      console.error(error.message);
    }
  });
  console.log("Connected to dashaboard.db");
  return db;
}

function createOperatorsTable(db) {
  db.run(`
  CREATE TABLE IF NOT EXISTS operators
  (
    id TEXT PRIMARY KEY,
    name TEXT
  )
  `);
}

async function updateOperators(db) {
  const operators = await getOperators();
  for (const operator of operators) {
    console.log(operator);
    const operatorData = [operator.Id, operator.Name];
    db.run(
      "INSERT INTO operators(id, name) VALUES (?, ?)",
      operatorData,
      (error) => {
        if (error) {
          console.error(error.message);
        } else {
          console.log(`Inserted ${operator.Name} (${operator.Id})`);
        }
      }
    );
  }
}

function deleteOperators(db) {
  db.run("DELETE FROM operators");
}

async function createPositionsTable(db) {
  db.run(`
  CREATE TABLE IF NOT EXISTS positions
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
  `);
}
function deletePositions(db) {
  db.run("DELETE FROM positions");
}

async function updatePositions(db) {
  deletePositions(db);
  const positions = await getVehiclePositions();
  for (const position of positions) {
    if (position.vehicle.trip) {
      const [operator, tripId] = position.vehicle.trip.tripId.split(":");
      const [_, routeId] = position.vehicle.trip.routeId.split(":");
      const data = [
        `${position.vehicle.trip.tripId}:${position.vehicle.vehicle.id}`,
        operator,
        tripId,
        position.vehicle.vehicle.id,
        routeId,
        position.vehicle.trip.directionId,
        position.vehicle.position.latitude,
        position.vehicle.position.longitude,
        position.vehicle.position.bearing,
        position.vehicle.position.speed,
      ];
      db.run(
        `
        INSERT INTO positions
        (id, operator, trip_id, vehicle_id, route_id, direction_id, latitude, longitude, bearing, speed)
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        data,
        (error) => {
          if (error) {
            console.error(error);
          } else {
            console.log(`Inserted ${operator} - ${tripId}`);
          }
        }
      );
    }
  }
}

function getPositions(db, operator) {
  return new Promise((resolve, reject) => {
    let query;
    if (operator !== "RG") {
      query = `SELECT * FROM positions WHERE operator = '${operator}'`;
    } else {
      query = "SELECT * FROM positions";
    }
    db.all(query, (error, rows) => {
      if (error) {
        return reject(error);
      } else {
        return resolve(rows);
      }
    });
  });
}

async function createOperatorDataTable(db, operator) {
  const operatorData = await getOperatorData(operator);
  console.log(operatorData);
}

export { connectDB, getPositions, updatePositions, createOperatorDataTable };
