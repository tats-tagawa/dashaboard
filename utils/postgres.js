import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();
import {
  getOperatorsTransitData,
  getOperatorColors,
  getOperatorCommonNames,
  getVehiclePositions,
  getOperatorGTFSDataFeed,
} from "./transit-data.js";

const { Pool } = pg;

/**
 * Connect to Postgres database (Neon or Supabase)
 * @returns {object} database pool
 */
function connectDB() {
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') 
      ? false 
      : { rejectUnauthorized: false },
  });
  console.log("Connected to Postgres");
  return db;
}

/**
 * Helper to run a parameterized query
 * @param {object} db
 * @param {string} sql
 * @param {array} values
 * @returns {array} rows
 */
async function query(db, sql, values = []) {
  const result = await db.query(sql, values);
  return result.rows;
}

/**
 * Create all tables necessary
 * @param {object} db
 */
async function createAllTables(db) {
  await createOperatorsTable(db);
  await createTripsTable(db);
  await createPositionsTable(db);
  await createShapesTable(db);
  await createStopsTable(db);
  await createTripStopsTable(db);
}

/**
 * Delete existing data from table
 * @param {object} db
 * @param {string} table
 */
async function deleteTableData(db, table) {
  await db.query(`DELETE FROM ${table}`);
}

/**
 * Create table for list of operators
 * @param {object} db
 */
async function createOperatorsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS operators (
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
async function getOperators(db) {
  return query(db, `SELECT * FROM operators`);
}

/**
 * Get general information for a single operator
 * @param {object} db
 * @param {string} operator
 * @returns {array}
 */
async function getOperator(db, operator) {
  return query(db, `SELECT * FROM operators WHERE id=$1`, [operator]);
}

/**
 * Get list of operators with vehicles in service
 * @param {object} db
 * @returns {array}
 */
async function getActiveOperators(db) {
  return query(
    db,
    `SELECT * FROM operators WHERE id IN (SELECT DISTINCT operator FROM positions) ORDER BY common_name`
  );
}

/**
 * Update operator table with data from 511.org
 * @param {object} db
 */
async function updateOperators(db) {
  await deleteTableData(db, "operators");
  const colors = getOperatorColors();
  const commonName = getOperatorCommonNames();
  try {
    const operators = await getOperatorsTransitData();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const operator of operators) {
        if (operator.Id !== "RG") {
          await client.query(
            `INSERT INTO operators(id, name, common_name, color) VALUES ($1, $2, $3, $4)`,
            [
              operator.Id ?? null,
              operator.Name ?? null,
              commonName[operator.Id] ?? null,
              colors[operator.Id] ?? null,
            ]
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log("Updated Operators List");
  } catch (error) {
    console.error(error);
  }
}

/**
 * Update all data tables for a single operator
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
        console.log(`Updating ${operator} Trip Stops (may take up to 10 mins)`);
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
 * Warning: May require > 10 mins to complete
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
  await db.query(`
    CREATE TABLE IF NOT EXISTS positions (
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
    )
  `);
}

/**
 * Get positions of all transit vehicles in service for an operator
 * @param {object} db
 * @param {string} operator
 * @returns {array}
 */
async function getPositions(db, operator) {
  if (operator !== "RG") {
    return query(db, `SELECT * FROM positions WHERE operator=$1`, [operator]);
  }
  return query(db, `SELECT * FROM positions`);
}

/**
 * Update position table with most recent position information
 * @param {object} db
 */
async function updatePositions(db) {
  console.log("Updating Positions");
  try {
    const positions = await getVehiclePositions();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM positions");
      for (const position of positions) {
        if (position.vehicle.trip) {
          const [operator, tripId] = position.vehicle.trip.tripId.split(":");
          const [_, routeId] = position.vehicle.trip.routeId.split(":");
          try {
            let shapeId = await getTripShapeId(db, operator, tripId);
            shapeId = shapeId?.shape_id ?? null;
            await client.query(
              `INSERT INTO positions
                (id, operator, trip_id, shape_id, vehicle_id, route_id, direction_id, latitude, longitude, bearing, speed)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING`,
              [
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
              ]
            );
          } catch (error) {
            console.error(error);
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log("Updated Positions");
  } catch (error) {
    console.error(error);
  }
}

/**
 * Create table for trip information
 * @param {object} db
 */
async function createTripsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS trips (
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
 * Helper to parse a CSV row with the existing regex logic
 * @param {string} row
 * @returns {array|null}
 */
function parseCSVRow(row) {
  const re = /(".*?"|[^",\s]+)(?=\s*,|\s*$)|(,,)/g;
  const matched = row.match(re);
  if (!matched) return null;
  return matched.map((el) => {
    const cleaned = el.replaceAll('"', "") ?? null;
    if (cleaned === ",," || (typeof cleaned === "string" && cleaned.trim() === "")) return "";
    return cleaned;
  });
}

/**
 * Helper to parse a CSV row with double-comma handling
 * @param {string} row
 * @returns {array|null}
 */
function parseCSVRowWithEmpties(row) {
  const regex = /,,/g;
  while (regex.test(row)) row = row.replace(regex, ",|,");
  const regex2 = /,$/g;
  row = row.replace(regex2, ",|");
  const re = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
  const matched = row.match(re);
  if (!matched) return null;
  return matched.map((el) => el.replaceAll("|", "").replaceAll('"', "") ?? null);
}

/**
 * Helper to bulk insert rows using a single transaction
 * @param {object} db
 * @param {string} sql - parameterized query with $1, $2, etc.
 * @param {array} rowsData - array of value arrays
 * @param {string} label - for progress display
 */
async function bulkInsert(db, sql, rowsData, label = "") {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const batchSize = 1000;
    for (let i = 0; i < rowsData.length; i += batchSize) {
      const batch = rowsData.slice(i, i + batchSize);
      for (const values of batch) {
        const sanitized = values.map((val) => {
          if (val === "" || val === ",," || (typeof val === "string" && val.trim() === "")) return null;
          return val;
        });
        await client.query(sql, sanitized);
      }
      if (label) progress(Math.min(i + batchSize, rowsData.length), rowsData.length);
    }
    await client.query("COMMIT");
    if (label) process.stdout.write("\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update trips table with all scheduled trips for an operator
 * @param {object} db
 * @param {string} data
 * @param {string} operator
 * @returns {string}
 */
async function updateOperatorTrips(db, data, operator) {
  await query(db, `DELETE FROM trips WHERE operator=$1`, [operator]);
  const rows = data.split("\r\n");
  const rowsData = [];
  for (const row of rows) {
    const parsed = parseCSVRow(row);
    if (!parsed) continue;
  const tripData = [operator].concat(parsed);  // tripData defined here
  while (tripData.length < 11) tripData.push(null);  // used here, inside the loop
    rowsData.push(tripData);
  }
  await bulkInsert(
    db,
    `INSERT INTO trips
      (operator, route_id, service_id, trip_id, trip_headsign, direction_id, block_id, shape_id, trip_short_name, bikes_allowed, wheelchair_accessible)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    rowsData
  );
  return `Updated ${operator} Trips`;
}

/**
 * Create table for shape coordinates
 * @param {object} db
 */
async function createShapesTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS shapes (
      operator TEXT,
      shape_id TEXT,
      shape_pt_lon REAL,
      shape_pt_lat REAL,
      shape_pt_sequence INT,
      shape_dist_traveled REAL
    )
  `);
}

/**
 * Update table with the coordinates of each shape for an operator
 * @param {object} db
 * @param {string} data
 * @param {string} operator
 * @returns {string}
 */
async function updateOperatorShapes(db, data, operator) {
  await query(db, `DELETE FROM shapes WHERE operator=$1`, [operator]);
  const rows = data.split("\r\n");
  const rowsData = rows
    .map((row) => [operator].concat(row.split(",")))
    .filter((r) => r.length >= 5 && r.length <= 6)
    .map((r) => { while (r.length < 6) r.push(null); return r; });
  await bulkInsert(
    db,
    `INSERT INTO shapes
      (operator, shape_id, shape_pt_lon, shape_pt_lat, shape_pt_sequence, shape_dist_traveled)
      VALUES ($1, $2, $3, $4, $5, $6)`,
    rowsData,
    "shapes"
  );
  return `Updated ${operator} Shapes`;
}

/**
 * Get shape ID of the provided trip ID
 * @param {object} db
 * @param {string} operator
 * @param {string} tripId
 * @returns {object|undefined}
 */
async function getTripShapeId(db, operator, tripId) {
  const rows = await query(
    db,
    `SELECT shape_id FROM trips WHERE operator=$1 AND trip_id=$2`,
    [operator, tripId]
  );
  return rows[0] ?? undefined;
}

/**
 * Get coordinates of the provided shape ID
 * @param {object} db
 * @param {string} operator
 * @param {string} shapeId
 * @returns {array}
 */
async function getShapeCoordinates(db, operator, shapeId) {
  const rows = await query(
    db,
    `SELECT shape_pt_lon, shape_pt_lat FROM shapes WHERE operator=$1 AND shape_id=$2 ORDER BY shape_pt_sequence`,
    [operator, shapeId]
  );
  return rows.map((obj) => [obj.shape_pt_lon, obj.shape_pt_lat]);
}

/**
 * Get coordinates for all the provided shape IDs
 * @param {object} db
 * @param {string} operator
 * @param {array} shapeIds
 * @returns {object} key - shapeId, value - array of coordinates
 */
async function getAllShapeCoordinates(db, operator, shapeIds) {
  if (!shapeIds.length) return {}
  const placeholders = shapeIds.map((_, i) => `$${i + 2}`).join(", ");
  const rows = await query(
    db,
    `SELECT * FROM shapes WHERE operator=$1 AND shape_id IN (${placeholders}) ORDER BY shape_id, shape_pt_sequence`,
    [operator, ...shapeIds]
  );
  return rows.reduce((acc, { shape_id, shape_pt_lon, shape_pt_lat }) => {
    if (!acc[shape_id]) acc[shape_id] = [];
    acc[shape_id].push([shape_pt_lon, shape_pt_lat]);
    return acc;
  }, {});
}

/**
 * Create table for stops (station) information
 * @param {object} db
 */
async function createStopsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS stops (
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
      platform_code TEXT
    )
  `);
}

/**
 * Update table with all stops for the operator
 * @param {object} db
 * @param {string} data
 * @param {string} operator
 * @returns {string}
 */
async function updateOperatorStops(db, data, operator) {
  await query(db, `DELETE FROM stops WHERE operator=$1`, [operator]);
  const rows = data.split("\r\n");
  const rowsData = [];
  for (const row of rows) {
    const parsed = parseCSVRowWithEmpties(row);
    if (!parsed) continue;
  const stopsData = [operator].concat(parsed);
  while (stopsData.length < 14) stopsData.push(null);
    rowsData.push(stopsData);
  }
  await bulkInsert(
    db,
    `INSERT INTO stops
      (operator, stop_id, stop_code, stop_name, stop_lat, stop_lon,
      zone_id, stop_desc, stop_url, location_type, parent_station,
      stop_timezone, wheelchair_boarding, platform_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    rowsData
  );
  return `Updated ${operator} Stops`;
}

/**
 * Create table for trip stops information
 * @param {object} db
 */
async function createTripStopsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS trip_stops (
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
    )
  `);
}

/**
 * Get all trip stops for each trip ID
 * @param {object} db
 * @param {string} operator
 * @param {array} tripIds
 * @returns {array}
 */
async function getOperatorTripStops(db, operator, tripIds) {
  if (!tripIds.length) return [];
  const placeholders = tripIds.map((_, i) => `$${i + 2}`).join(", ");
  return query(
    db,
    `SELECT * FROM stops WHERE stop_id IN (SELECT DISTINCT stop_id FROM trip_stops WHERE operator=$1 AND trip_id IN (${placeholders}))`,
    [operator, ...tripIds]
  );
}

/**
 * Update trip stops data for an operator
 * @param {object} db
 * @param {string} data
 * @param {string} operator
 * @returns {string}
 */
async function updateOperatorTripStops(db, data, operator) {
  await query(db, `DELETE FROM trip_stops WHERE operator=$1`, [operator]);
  const rows = data.split("\r\n");
  const rowsData = [];
  for (const row of rows) {
    const parsed = parseCSVRowWithEmpties(row);
    if (!parsed) continue;
  const tripStopsData = [operator].concat(parsed);  // tripData defined here
  while (tripStopsData.length < 11) tripStopsData.push(null);  // used here, inside the loop
    rowsData.push(tripStopsData);
  }
  await bulkInsert(
    db,
    `INSERT INTO trip_stops
      (operator, trip_id, arrival_time, departure_time, stop_id, stop_sequence,
      stop_headsign, pickup_type, drop_off_type, shape_dist_traveled, timepoint)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    rowsData,
    "trip_stops"
  );
  return `Updated ${operator} Trip Stops`;
}

export {
  connectDB,
  createAllTables,
  getOperators,
  getOperator,
  getActiveOperators,
  getPositions,
  updatePositions,
  getShapeCoordinates,
  getAllShapeCoordinates,
  getOperatorTripStops,
  updateOperatorDataTable,
  updateAllOperators,
  updateOperators,
};

/**
 * Show progress of how much data has been processed.
 * @param {int} count
 * @param {int} length
 */
function progress(count, length) {
  const counter = ((count / length) * 100).toFixed(1);
  process.stdout.write(`\r${counter}%`);
}
