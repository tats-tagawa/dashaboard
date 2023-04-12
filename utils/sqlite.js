import sqlite3 from "sqlite3";
import * as dotenv from "dotenv";
dotenv.config();
import {
  getOperatorsTransitData,
  getOperatorColors,
  getOperatorCommonNames,
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
  db.run("PRAGMA journal_mode = WAL;");
  return db;
}

function createAllTables(db) {
  createOperatorsTable(db);
  createTripsTable(db);
  createPositionsTable(db);
  createShapesTable(db);
  createStopsTable(db);
  createTripStopsTable(db);
}
createAllTables(connectDB());

function deleteTableData(db, table) {
  db.run(`DELETE FROM ${table}`);
}

function createOperatorsTable(db) {
  db.run(`
  CREATE TABLE IF NOT EXISTS operators
  (
    id TEXT PRIMARY KEY,
    name TEXT,
    common_name TEXT,
    color TEXT
  )
  `);
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

function getActiveOperators(db) {
  return new Promise((resolve, reject) => {
    let query = `SELECT DISTINCT operator FROM positions`;
    db.all(query, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

async function updateOperators(db) {
  deleteTableData(db, "operators");
  const colors = getOperatorColors();
  const commonName = getOperatorCommonNames();
  const operators = await getOperatorsTransitData();
  for (const operator of operators) {
    if (operator.Id !== "RG") {
      const operatorData = [
        operator.Id,
        operator.Name,
        commonName[operator.Id],
        colors[operator.Id],
      ];
      db.run(
        "INSERT INTO operators(id, name, common_name, color) VALUES (?, ?, ?, ?)",
        operatorData,
        (error) => {
          if (error) {
            console.error(error.message);
          }
        }
      );
    }
  }
  console.log("Updated Operators List");
}

async function updateOperatorDataTable(db, operator) {
  console.log(`Updating ${operator} Data Table`);
  const operatorData = await getOperatorGTFSDataFeed(operator);
  for await (const data of operatorData) {
    if (data[0] === "shapes") {
      console.log(`Updating ${operator} Shapes`);
      const status = await updateOperatorShapes(db, data[2], operator);
      console.log(status);
    }
    if (data[0] === "trips") {
      console.log(`Updating ${operator} Trips`);
      const status = await updateOperatorTrips(db, data[2], operator);
      console.log(status);
    }
    if (data[0] === "stops") {
      console.log(`Updating ${operator} Stops`);
      const status = await updateOperatorStops(db, data[2], operator);
      console.log(status);
    }
    if (data[0] === "stop_times") {
      console.log(`Updating ${operator} Trip Stops`);
      const status = await updateOperatorTripStops(db, data[2], operator);
      console.log(status);
    }
  }
  console.log(`Updated ${operator} Data Table`);
}

async function updateAllOperators(db) {
  await updateOperators(db);
  const operators = await getOperators(db);
  for (const operator of operators) {
    console.log(`Updating ${operator.id} ------`);
    await updateOperatorDataTable(db, operator.id);
  }
  console.log("Updated All");
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

async function updateOperatorTrips(db, data, operator) {
  db.run(`DELETE FROM trips WHERE operator='${operator}'`);
  let rows = data.split("\r\n");
  let promises = rows.map((row) => {
    return new Promise((resolve, reject) => {
      // split by commas except when commas are within double quotes
      // regex from https://stackoverflow.com/q/11456850/4855664
      const re = /(".*?"|[^",\s]+)(?=\s*,|\s*$)|(,,)/g;
      row = row.match(re);
      row = row.map((el) => el.replaceAll('"', ""));
      // add operator id at index 0
      const tripData = [operator].concat(row);
      const query = `
        INSERT INTO trips
          (operator, route_id, service_id, trip_id, trip_headsign, direction_id, block_id, shape_id, trip_short_name, bikes_allowed, wheelchair_accessible)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      db.run(query, tripData, (error) => {
        if (error) {
          console.log(`Trips Error - ${tripData}`);
          console.error(error);
          reject(error);
        } else {
          resolve("Done");
        }
      });
    });
  });
  try {
    await Promise.all(promises);
  } catch (error) {
    console.error(error);
  }
  return `Updated ${operator} Trips`;
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

async function updateOperatorShapes(db, data, operator) {
  db.run(`DELETE FROM shapes WHERE operator='${operator}'`);
  let rows = data.split("\r\n");
  let promises = rows.map((row) => {
    return new Promise((resolve, reject) => {
      const shapeData = [operator].concat(row.split(","));
      const query = `
          INSERT INTO shapes
            (operator, shape_id, shape_pt_lon, shape_pt_lat, shape_pt_sequence, shape_dist_traveled)
          VALUES
            (?, ?, ?, ?, ?, ?)
          `;
      db.run(query, shapeData, (error) => {
        if (error) {
          console.log(`Shapes Error - ${shapeData}`);
          reject(error);
        } else {
          resolve("Done");
        }
      });
    });
  });

  try {
    await Promise.all(promises);
  } catch (error) {
    console.error(error);
  }
  return `Updated ${operator} Shapes`;
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
        resolve(undefined);
      }
    });
  });
}

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
    const query = `SELECT shape_pt_lon, shape_pt_lat FROM shapes WHERE operator='${operator}' AND shape_id='${shapeId}' ORDER BY shape_pt_sequence`;
    db.all(query, (error, coordinates) => {
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

async function getAllShapeCoordinates(db, operator, shapeIds) {
  return new Promise((resolve, reject) => {
    const shapeIdsProcessed = shapeIds.map((shapeId) => `'${shapeId}'`);
    const query = `SELECT * FROM shapes WHERE operator='${operator}' AND shape_id IN (${shapeIdsProcessed.join()}) ORDER BY shape_id, shape_pt_sequence`;
    db.all(query, (error, data) => {
      if (error) reject(error);

      // acc: object with shape coordinates {shapeId: coordinates}
      const shapes = data.reduce(
        (acc, { shape_id, shape_pt_lon, shape_pt_lat }) => {
          if (!acc[shape_id]) {
            acc[shape_id] = [];
          }
          acc[shape_id].push([shape_pt_lon, shape_pt_lat]);
          return acc;
        },
        {}
      );
      resolve(shapes);
    });
  });
}

async function createStopsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS stops
      (
        operator TEXT,
        stop_id TEXT,
        stop_code TEXT,
        stop_name TEXT,
        stop_lat REAL,
        stop_lon REAL,
        zone_id INT,
        stop_desc TEXT,
        stop_url TEXT,
        location_type INT,
        parent_station TEXT,
        stop_timezone TEXT,
        wheelchair_boarding INT,
        platform_code
      )`);
}

async function getOperatorTripStops(db, operator, tripIds) {
  return new Promise((resolve, reject) => {
    const tripIdsProcessed = tripIds.map((tripId) => `'${tripId}'`);
    const query = `SELECT * FROM trip_stops WHERE operator='${operator}' AND trip_id IN (${tripIdsProcessed.join()}) ORDER BY trip_id, stop_sequence`;
    db.all(query, (error, data) => {
      if (error) reject(error);

      // acc: object with shape coordinates {shapeId: coordinates}
      const tripStops = data.reduce(
        (acc, {trip_id, stop_id}) => {
          if (!acc[trip_id]) {
            acc[trip_id] = [];
          }
          acc[trip_id].push(stop_id);
          return acc;
        },
        {}
      );
      resolve(tripStops);
    });
  });
}

async function updateOperatorStops(db, data, operator) {
  await db.run(`DELETE FROM stops WHERE operator='${operator}'`);
  let rows = data.split("\r\n");
  let promises = rows.map((row) => {
    return new Promise((resolve, reject) => {
      // add "|" between double commas so it can be splitted correctly
      const regex = /,,/g;
      while (regex.test(row)) {
        row = row.replace(regex, ",|,");
      }

      // add "|" at end of string if string ends with a comma
      const regex2 = /,$/g;
      row = row.replace(regex2, ",|");

      // split by commas except when commas are within double quotes
      // regex from https://stackoverflow.com/q/11456850/4855664
      const re = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
      row = row.match(re);

      // replace all "|" added earlier with empty string
      // replace all quotations marks with empty string
      row = row.map((el) => {
        el = el.replaceAll("|", "");
        return el.replaceAll('"', "");
      });

      // add operator id at index 0
      const stopsData = [operator].concat(row);
      const query = `
        INSERT INTO stops
          (operator, stop_id, stop_code, stop_name, stop_lat, stop_lon,
          zone_id, stop_desc, stop_url, location_type, parent_station,
          stop_timezone, wheelchair_boarding, platform_code)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      db.run(query, stopsData, (error) => {
        if (error) {
          console.log(`Stops Error - ${stopsData}`);
          console.error(error);
          reject(error);
        } else {
          resolve("Done");
        }
      });
    });
  });
  try {
    await Promise.all(promises);
  } catch (error) {
    console.error(error);
  }
  return `Updated ${operator} Stops`;
}

async function createTripStopsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS trip_stops
      (
        operator TEXT,
        trip_id TEXT,
        arrival_time TEXT,
        departure_time TEXT,
        stop_id TEXT,
        stop_sequence INT,
        stop_headsign TEXT,
        pickup_type INT,
        drop_off_type INT,
        shape_dist_traveled REAL,
        timepoint INT
      )`);
}

async function updateOperatorTripStops(db, data, operator) {
  await db.run(`DELETE FROM trip_stops WHERE operator='${operator}'`);
  let rows = data.split("\r\n");
  let promises = rows.map((row) => {
    return new Promise((resolve, reject) => {
      // add "|" between double commas so it can be splitted correctly
      const regex = /,,/g;
      while (regex.test(row)) {
        row = row.replace(regex, ",|,");
      }

      // add "|" at end of string if string ends with a comma
      const regex2 = /,$/g;
      row = row.replace(regex2, ",|");

      // split by commas except when commas are within double quotes
      // regex from https://stackoverflow.com/q/11456850/4855664
      const re = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
      row = row.match(re);

      // replace all "|" added earlier with empty string
      // replace all quotations marks with empty string
      row = row.map((el) => {
        el = el.replaceAll("|", "");
        return el.replaceAll('"', "");
      });

      // add operator id at index 0
      const tripStopsData = [operator].concat(row);
      const query = `
        INSERT INTO trip_stops
          (operator, trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type, shape_dist_traveled, timepoint)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      db.run(query, tripStopsData, (error) => {
        if (error) {
          console.log(`Stops Error - ${tripStopsData}`);
          console.error(error);
          reject(error);
        } else {
          resolve("Done");
        }
      });
    });
  });
  try {
    await Promise.all(promises);
  } catch (error) {
    console.error(error);
  }
  return `Updated ${operator} Trip Stops`;
}

export {
  connectDB,
  getOperators,
  getOperator,
  getActiveOperators,
  getPositions,
  updatePositions,
  getShapeCoordinates,
  getAllShapeCoordinates,
};
