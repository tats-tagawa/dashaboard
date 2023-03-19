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
  deleteTableData(db, "operators")
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
  console.log("Updated operators");
}

function deleteTableData(db, table) {
  db.run(`DELETE FROM ${table}`);
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

async function updatePositions(db) {
  deleteTableData(db, 'positions');
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
      const query = `
        INSERT INTO positions
          (id, operator, trip_id, vehicle_id, route_id, direction_id, latitude, longitude, bearing, speed)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      db.run(query, data, (error) => {
        if (error) {
          console.error(error);
        } else {
        }
      });
    }
  }
  console.log("Updated positions");
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

async function createTripsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS trips
      (
        route_id TEXT,
        service_id TEXT,
        trip_id TEXT PRIMARY KEY,
        trip_headsign TEXT,
        direction_id INT,
        block_id TEXT,
        shape_id TEXT,
        trip_short_name TEXT,
        bikes_allowed INT,
        wheelchair_accessible INT
      )
  `)
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
  db.run(`DELETE FROM shapes`)
  const operatorData = await getOperatorData(operator);
  for (const data of operatorData) {
    if (data[0] === "shapes") {
      let rows = data[2].split("\r\n");
      rows.forEach((row, index) => {
        rows[index] = [operator].concat(row.split(","));
        const query = `
          INSERT INTO shapes
            (operator, shape_id, shape_pt_lon, shape_pt_lat, shape_pt_sequence, shape_dist_traveled)
          VALUES
            (?, ?, ?, ?, ?, ?)
          `;
        db.run(query, rows[index], (error) => {
          if (error) {
            console.error(error);
          } else {
          }
        });
      });
    }
  }
}

async function getShapeIds(db, operator) {
  return new Promise((resolve, reject) => {
    const query = `SELECT DISTINCT shape_id FROM shapes WHERE operator='${operator}'`;
    db.all(query, (error, rows) => {
      if (error) {
        return reject(error);
      }
      rows = rows.map((obj) => {
        return obj.shape_id;
      });
      return resolve(rows);
    });
  });
}

async function getShapeCoordinates(db, shapeId) {
  return new Promise((resolve, reject) => {
    const coordinate_query = `SELECT shape_pt_lon, shape_pt_lat FROM shapes WHERE shape_id='${shapeId}' ORDER BY shape_pt_sequence`;
    db.all(coordinate_query, (error, coordinates) => {
      if (error) {
        return reject(error);
      }
      const coordinatesArray = coordinates.map((obj) => {
        return [obj.shape_pt_lon, obj.shape_pt_lat];
      });
      return resolve(coordinatesArray)
    });
  });
}

async function getAllShapeCoordinates(db, operator) {
  const shapeCoordinates = {}
  const shapeIds = await getShapeIds(db, operator);
  for (const shapeId of shapeIds) {
    shapeCoordinates[shapeId] = await getShapeCoordinates(db, shapeId)
  }
  return shapeCoordinates;
}

// const db = connectDB();
// console.log(await getAllShapeCoordinates(db, "CT"))
// db.all('pragma table_info(shapes)', (error, data) => {
//   if (error) {
//     console.error(error);
//   }
//   console.log(data)
// })

export { connectDB, getPositions, updatePositions };
