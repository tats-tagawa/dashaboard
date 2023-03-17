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
    const operatorData = [operator.Id, operator.Name];
    db.run(
      "INSERT INTO operators(id, name) VALUES (?, ?)",
      operatorData,
      (error) => {
        if (error) {
          console.error(error.message);
        } else {
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
  )`);
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
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data,
        (error) => {
          if (error) {
            console.error(error);
          } else {
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

async function createShapesTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS shapes
      (
        operator TEXT,
        shape_id TEXT,
        shape_pt_lon REAL,
        shape_pt_lat REAL,
        shape_pt_sequence INT,
        shape_dist_traveled REAL
      )`);
}

async function updateShapesTable(db, operator) {
  console.log("getting data....");
  const operatorData = await getOperatorData(operator);
  for (const data of operatorData) {
    if (data[0] === "shapes") {
      let rows = data[2].split("\r\n");
      rows.forEach((row, index) => {
        rows[index] = [operator].concat(row.split(","));
        console.log(rows[index]);
          db.run(
            `
        INSERT INTO shapes
          (operator, shape_id, shape_pt_lon, shape_pt_lat, shape_pt_sequence, shape_dist_traveled)
        VALUES
          (?, ?, ?, ?, ?, ?)
        `,
            rows[index],
            (error) => {
              if (error) {
                console.error(error);
              } else {
              }
            }
          );
      });
      console.log('Inserting shapes complete')
    }
  }
}
// let db = connectDB();
// createShapesTable(db);
// updateShapesTable(db, "CT");
export { connectDB, getPositions, updatePositions };
