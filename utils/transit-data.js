import fs from "fs";
import axios from "axios";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fileURLToPath } from "url";
import path from "path";
import * as dotenv from "dotenv";
dotenv.config();
import JSZip from "jszip";
import { Writable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getOperatorsTransitData() {
  try {
    const response = await axios.get(
      `http://api.511.org/transit/gtfsoperators?api_key=${process.env.API_KEY}`
    );
    return response.data;
  } catch (error) {
    console.error(error);
  }
}

/**
 * returns each operator's main color as hex
 * @returns {object}
 */
function getOperatorColors() {
  return {
    "3D": "#3D8A4C",
    AC: "#2D6955",
    AF: "#5EAFBF",
    AM: "#1E1B4B",
    BA: "#2962A3",
    CC: "#F5BC5B",
    CE: "#84528D",
    CM: "#5A97BD",
    CT: "#E31837",
    DE: "#263365",
    EM: "#F5D44D",
    FS: "#659053",
    GF: "#CE5E29",
    GG: "#2B5F2F",
    MA: "#5FAD41",
    MB: "#3357A2",
    MV: "#C7E2F2",
    PE: "#586DA4",
    RV: "#81A8E7",
    SA: "#013220",
    SB: "#95AAD5",
    SC: "#4CB4E7",
    SF: "#B5333A",
    SI: "#265C78",
    SM: "#215196",
    SO: "#213783",
    SR: "#2C68A7",
    SS: "#76DC85",
    ST: "#4E9146",
    TD: "#2F3C92",
    TF: "#224D82",
    UC: "#15196D",
    VC: "#466097",
    VN: "#D8794E",
    WC: "#2A467E",
    WH: "#0A172E",
  };
}

/**
 * returns shorter name for each operator
 * @returns {object}
 */
function getOperatorCommonNames() {
  return {
    "3D": "Tri Delta Transit",
    AC: "AC Transit",
    AF: "Angel Island Triburon Ferry",
    AM: "Capital Corridor",
    BA: "BART",
    CC: "County Connection",
    CE: "ACE",
    CM: "Commute.org Shuttles",
    CT: "Caltrain",
    DE: "Dumbarton Express",
    EM: "Emery Go-Round",
    FS: "FAST Transit",
    GF: "Golden Gate Ferry",
    GG: "Golden Gate Transit",
    MA: "Marin Transit",
    MB: "Mission Bay TMA",
    MV: "MVgo",
    PE: "Petaluma Transit",
    RV: "Rio Vista Delta Breeze",
    SA: "SMART",
    SB: "SF Bay Ferry",
    SC: "VTA",
    SF: "SF MUNI",
    SI: "SFO",
    SM: "SamTrans",
    SO: "Sonoma County Transit",
    SR: "Santa Rosa CityBus",
    SS: "South City Shuttle",
    ST: "SolTrans",
    TD: "Tideline Water Taxi",
    TF: "Treasure Island Ferry",
    UC: "Union City Transit",
    VC: "Vacaville City Coach",
    VN: "VINE Transit",
    WC: "WestCat",
    WH: "LAVDA",
  };
}

/**
 * Get realtime vehicle location data
 * @param {string} operator=RG - operator's code name
 * @returns {object} JSON object
 */
async function getVehiclePositions(operator = "RG") {
  try {
    const response = await axios.get(
      `http://api.511.org/Transit/VehiclePositions?api_key=${process.env.API_KEY}&agency=${operator}`,
      { responseType: "arraybuffer" }
    );
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );
    return feed.entity;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get ETA/names of upcoming stops for vehicles
 * @param {string} operator=RG - operator's code name
 * @returns {object} JSON object
 */
async function getTripUpdates(operator = "RG") {
  try {
    const response = await axios.get(
      `http://api.511.org/Transit/TripUpdates?api_key=${process.env.API_KEY}&agency=${operator}`,
      { responseType: "arraybuffer" }
    );
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );
    return feed.entity;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get all information from GTFS Data Feed for an operator.
 * Each file is stored in each index
 * @param {string} operator 
 * @returns {array} 
 */
async function getOperatorGTFSDataFeed(operator) {
  try {
    console.log(`Downloading ${operator} GTFS Data`);
    const response = await axios({
      method: "get",
      url: `http://api.511.org/Transit/datafeeds?api_key=${process.env.API_KEY}&operator_id=${operator}`,
      responseType: "stream",
    });
    if (response.status === 200) {
      const chunks = [];
      const writer = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        try {
          writer.on("finish", async () => {
            const buffer = Buffer.concat(chunks);
            const zip = new JSZip();
            const contents = await zip.loadAsync(buffer);
            const files = [];
            for (let filename of Object.keys(contents.files)) {
              const data = await zip.file(filename).async("string");
              filename = `${filename.split(".txt")[0]}`;
              const delimiter = /\r\n/;
              const parts = data.split(delimiter);
              const header = parts.shift();
              const rows = parts.join("\r\n");
              files.push([filename, header, rows]);
            }
            console.log(`Downloaded ${operator} GTFS Data`);
            resolve(files);
          });
        } catch (error) {
          reject(error);
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
}

export {
  getOperatorsTransitData,
  getOperatorColors,
  getOperatorCommonNames,
  getVehiclePositions,
  getTripUpdates,
  getOperatorGTFSDataFeed,
};
