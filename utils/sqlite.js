import sqlite3 from "sqlite3";
import * as dotenv from "dotenv";
dotenv.config();
import {
  getOperatorsTransitData,
  getOperatorColors,
  getVehiclePositions,
  getOperatorGTFSDataFeed,
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

const db = connectDB();

function createOperatorsTable(db) {
  db.run(`
  CREATE TABLE IF NOT EXISTS operators
  (
    id TEXT PRIMARY KEY,
    name TEXT,
    color TEXT
  )
  `);
}

async function updateOperators(db) {
  deleteTableData(db, "operators");
  const colors = getOperatorColors();
  const operators = await getOperatorsTransitData();
  for (const operator of operators) {
    if (operator.Id !== "RG") {
      const operatorData = [operator.Id, operator.Name, colors[operator.Id]];
      db.run(
        "INSERT INTO operators(id, name, color) VALUES (?, ?, ?)",
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
  console.log("Updated Operators List");
}

function getOperators(db) {
  return new Promise((resolve, reject) => {
    let query;
    query = `SELECT * FROM operators`;
    db.all(query, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

function getOperator(db, operator) {
  return new Promise((resolve, reject) => {
    let query;
    query = `SELECT * FROM operators WHERE id='${operator}'`;
    db.all(query, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
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
      shape_id TEXT,
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
  console.log("Updating Positions");
  deleteTableData(db, "positions");
  const positions = await getVehiclePositions();
  for (const position of positions) {
    if (position.vehicle.trip) {
      const [operator, tripId] = position.vehicle.trip.tripId.split(":");
      const [_, routeId] = position.vehicle.trip.routeId.split(":");
      try {
        let shapeId = await getTripShapeId(db, operator, tripId);
        if (shapeId) {
          shapeId = shapeId.shape_id;
        } else {
          shapeId = null;
        }
        const data = [
          `${position.vehicle.trip.tripId}:${position.vehicle.vehicle.id}`,
          operator,
          tripId,
          shapeId,
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
          (id, operator, trip_id, shape_id, vehicle_id, route_id, direction_id, latitude, longitude, bearing, speed)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(query, data, (err) => {
          if (err) console.error(err);
        });
      } catch (error) {
        console.error(error);
      }
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
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

async function createTripsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS trips
      (
        operator TEXT,
        route_id TEXT,
        service_id TEXT,
        trip_id TEXT,
        trip_headsign TEXT,
        direction_id INT,
        block_id TEXT,
        shape_id TEXT,
        trip_short_name TEXT,
        bikes_allowed INT,
        wheelchair_accessible INT
      )
  `);
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

async function updateOperatorDataTable(db, operator) {
  console.log(`Updating ${operator} Data Table`);
  const operatorData = await getOperatorGTFSDataFeed(operator);
  for await (const data of operatorData) {
    if (data[0] === "shapes") {
      const status = await updateOperatorShapes(db, data, operator);
      console.log(status);
    } else if (data[0] === "trips") {
      const status = await updateOperatorTrips(db, data, operator);
      console.log(status);
    } else {
    }
  }

  console.log(`Updated ${operator} Data Table`);
}

function updateOperatorShapes(db, data, operator) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM shapes WHERE operator='${operator}'`);
    let rows = data[2].split("\r\n");
    for (const [index, row] of rows.entries()) {
      rows[index] = [operator].concat(row.split(","));
      const query = `
        INSERT INTO shapes
          (operator, shape_id, shape_pt_lon, shape_pt_lat, shape_pt_sequence, shape_dist_traveled)
        VALUES
          (?, ?, ?, ?, ?, ?)
        `;
      db.run(query, rows[index], (error) => {
        if (error) {
          console.log(`Shapes Error - ${rows[index]}`);
          reject(error);
        } else {
        }
      });
    }
    resolve(`Updated ${operator} Shapes`);
  });
}

function updateOperatorTrips(db, data, operator) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM trips WHERE operator='${operator}'`);
    let rows = data[2].split("\r\n");
    for (let [index, row] of rows.entries()) {
      // split by commas except when commas are within double quotes
      // regex from https://stackoverflow.com/q/11456850/4855664
      const re = /(".*?"|[^",\s]+)(?=\s*,|\s*$)|(,,)/g;
      row = row.match(re);
      row = row.map((el) => el.replaceAll('"', ""));
      // add operator id at index 0
      rows[index] = [operator].concat(row);
      const query = `
        INSERT INTO trips
          (operator, route_id, service_id, trip_id, trip_headsign, direction_id, block_id, shape_id, trip_short_name, bikes_allowed, wheelchair_accessible)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      db.run(query, rows[index], (error) => {
        if (error) {
          console.log(`Trips Error - ${rows[index]}`);
          console.error(error);
          reject(error);
        } else {
        }
      });
    }
    resolve(`Updated ${operator} Trips`);
  });
}

async function getTripShapeId(db, operator, tripId) {
  return new Promise((resolve, reject) => {
    const query = `
    SELECT shape_id FROM trips WHERE operator='${operator}' AND trip_id='${tripId}'
  `;
    db.get(query, (error, row) => {
      if (error) {
        reject(error);
      }
      if (row) {
        resolve(row);
      } else {
        resolve(undefined)
      }
    });
  });
}

// console.log(await getShapeCoordinates(db, await getTripShape(db, '122')));

async function getShapeIds(db, operator) {
  return new Promise((resolve, reject) => {
    const query = `SELECT DISTINCT shape_id FROM shapes WHERE operator='${operator}'`;
    db.all(query, (error, rows) => {
      if (error) {
        reject(error);
      }
      rows = rows.map((obj) => {
        return obj.shape_id;
      });
      resolve(rows);
    });
  });
}

async function getShapeCoordinates(db, operator, shapeId) {
  return new Promise((resolve, reject) => {
    const coordinate_query = `SELECT shape_pt_lon, shape_pt_lat FROM shapes WHERE operator='${operator}' AND shape_id='${shapeId}' ORDER BY shape_pt_sequence`;
    db.all(coordinate_query, (error, coordinates) => {
      if (error) {
        reject(error);
      }
      const coordinatesArray = coordinates.map((obj) => {
        return [obj.shape_pt_lon, obj.shape_pt_lat];
      });
      resolve(coordinatesArray);
    });
  });
}

async function getAllShapeCoordinates(db, operator) {
  const shapeCoordinates = {};
  const shapeIds = await getShapeIds(db, operator);
  for (const shapeId of shapeIds) {
    shapeCoordinates[shapeId] = await getShapeCoordinates(db, shapeId);
  }
  return shapeCoordinates;
}

async function updateAllOperators() {
  await updateOperators(db);
  const operators = await getOperators(db);
  for (const operator of operators) {
    console.log(`Updating ${operator.id} ------`);
    await updateOperatorDataTable(db, operator.id);
  }
  console.log("Updated All");
}

// updateOperatorDataTable(db, "SM")
// db.all('pragma table_info(shapes)', (error, data) => {
//   if (error) {
//     console.error(error);
//   }
//   console.log(data)
// })

export {
  connectDB,
  updateOperators,
  getOperators,
  getOperator,
  getPositions,
  updatePositions,
  getTripShapeId,
  getShapeCoordinates,
  updateOperatorDataTable,
};
