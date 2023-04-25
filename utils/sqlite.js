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

/**
 * Connect to sqlite database
 * @returns {object} database object
 */
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

/**
 * Create all tables necessary
 * @param {object} db 
 */
function createAllTables(db) {
  createOperatorsTable(db);
  createTripsTable(db);
  createPositionsTable(db);
  createShapesTable(db);
  createStopsTable(db);
  createTripStopsTable(db);
}

/**
 * Delete existing data from table to update with live data
 * @param {object} db 
 * @param {string} table name
 */
function deleteTableData(db, table) {
  db.run(`DELETE FROM ${table}`);
}

/**
 * Create table for list of operators 
 * @param {object} db 
 */
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

/**
 * Get list of operators and their general information
 * @param {object} db 
 * @returns {array} 
 */
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

/**
 * Get general information for a single operator
 * @param {object} db 
 * @param {string} operator 
 * @returns {array} 
 */
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

/**
 * Get list of operators with vehicles in service
 * @param {object} db 
 * @returns {array}
 */
function getActiveOperators(db) {
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM operators WHERE id IN (SELECT DISTINCT operator FROM positions) ORDER BY common_name`;
    db.all(query, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Update operator table with data from 511.org
 * @param {object} db 
 */
async function updateOperators(db) {
  deleteTableData(db, "operators");
  const colors = getOperatorColors();
  const commonName = getOperatorCommonNames();
  try {
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
  } catch (error) {
    console.error(error);
  }
}

/**
 * Update all data tables for a single operator
 * These are data that does not require frequent updates (transit stops, route shapes) unlike positions data
 * @param {object} db 
 * @param {string} operator 
 */
async function updateOperatorDataTable(db, operator) {
  console.log(`Updating ${operator} Data Table`);
  try {
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
  } catch (error) {
    console.error(error);
  }
}

/**
 * Update all data tables for all operators
 * Warning: May require > 10 mins to complete running
 * @param {object} db 
 */
async function updateAllOperators(db) {
  try {
    await updateOperators(db);
    const operators = await getOperators(db);
    for (const operator of operators) {
      console.log(`Updating ${operator.id} ------`);
      await updateOperatorDataTable(db, operator.id);
    }
    console.log("Updated All");
  } catch (error) {
    console.error(error);
  }
}

/**
 * Create table for positions of transit vehicles in service
 * @param {object} db 
 */
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

/**
 * Get positions of all transit vehicles in service for a operator
 * @param {object} db 
 * @param {string} operator 
 * @returns {array} 
 */
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

/**
 * Update position table with most recent position information
 * @param {object} db 
 */
async function updatePositions(db) {
  console.log("Updating Positions");
  deleteTableData(db, "positions");
  try {
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
    console.log("Updated Positions");
  } catch (error) {
    console.error(error);
  }
}

/**
 * Create table for trip information for each transit service
 * @param {object} db 
 */
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

/**
 * Update trips table with all scheduled trips for an operator
 * @param {object} db 
 * @param {array} data 
 * @param {string} operator 
 * @returns 
 */
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
      const tripId = tripData[3];
      const tripStops = getOperatorScheduledStops(db, operator, [tripId])
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

console.log(await getOperatorScheduledStops(connectDB(), "SA", ["t_5371018_b_78099_tn_0"]))

/**
 * Create table for shape coordinates 
 * @param {object} db 
 */
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

/**
 * Update table with with the coordinates of each shape for an operator
 * @param {object} db 
 * @param {array} data
 * @param {*} operator 
 * @returns {string}
 */
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

/**
 * Get shape ID of the provided trip ID
 * @param {object} db 
 * @param {string} operator 
 * @param {string} trip ID
 * @returns {array} shape IDs
 */
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

/**
 * Get coordinates of the provided shape ID
 * @param {object} db 
 * @param {string} operator 
 * @param {string} shape ID 
 * @returns {array} coordinates for the shape ID
 */
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

/**
 * Get coordinates for all the provided shape IDs
 * @param {object} db 
 * @param {string} operator 
 * @param {array} shape IDs 
 * @returns {object} key - shapeId, value - array of coordinates
 */
async function getAllShapeCoordinates(db, operator, shapeIds) {
  return new Promise((resolve, reject) => {
    const shapeIdsProcessed = shapeIds.map((shapeId) => `'${shapeId}'`);
    const query = `SELECT * FROM shapes WHERE operator='${operator}' AND shape_id IN (${shapeIdsProcessed.join()}) ORDER BY shape_id, shape_pt_sequence`;
    db.all(query, (error, data) => {
      if (error) reject(error);

      // acc: object with shape coordinates {shapeId: [coordinates]}
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

/**
 * Create table for stops (station) information for all operators
 * @param {object} db 
 */
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

/**
 * Update table with all stops for the operator
 * @param {object} db 
 * @param {array} data 
 * @param {string} operator 
 * @returns {string}
 */
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

/**
 * Create table for trip stops information
 * @param {object} db 
 */
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

/**
 * Get all trip stops that will be made for each trip ID
 * @param {object} db 
 * @param {string} operator 
 * @param {array} tripIds 
 * @returns {Promise<array>}
 */
function getOperatorScheduledStops(db, operator, tripIds) {
  return new Promise((resolve, reject) => {
    const tripIdsProcessed = tripIds.map((tripId) => `'${tripId}'`);
    const query = `SELECT * FROM stops WHERE stop_id IN (SELECT DISTINCT stop_id FROM trip_stops WHERE operator='${operator}' AND trip_id IN (${tripIdsProcessed}))`;
    db.all(query, (error, data) => {
      if (error) reject(error);
      resolve(data);
    });
  });
}

function getOperatorTripStops(db, operator, tripIds) {
  return new Promise((resolve, reject) => {
    const tripIdsProcessed = tripIds.map((tripId) => `'${tripId}'`);
    const query = `SELECT * FROM trip_stops WHERE operator='${operator}' AND trip_id IN (${tripIdsProcessed})`;
    db.all(query, (error, data) => {
      if (error) reject(error);
      resolve(data);
    });
  });
}

/**
 * Update trip stops data for an operator
 * @param {object} db 
 * @param {array} data 
 * @param {string} operator 
 * @returns {string}
 */
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
    const promiseLength = promises.length;
    for (let i = 0; i < promiseLength; i += 1000) {
      const request = promises.slice(i, i + 1000);
      await Promise.all(request);
      progress(i, promiseLength);
    }
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
  getOperatorScheduledStops
};

/**
 * Show progress of how much data has been processed.
 * @param {int} count 
 * @param {int} length 
 */
function progress(count, length) {
  let counter = count / length;
  process.stdout.write(`${count} / ${length}: ${counter}\r`);
  process.stdout.write(``);
}
