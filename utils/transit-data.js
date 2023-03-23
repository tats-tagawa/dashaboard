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

function getOperatorColors() {
  return {
    CC: "#000000",
    AC: "#000000",
    CE: "#000000",
    CM: "#000000",
    CT: "#E31837",
    DE: "#000000",
    EM: "#000000",
    FS: "#000000",
    GF: "#000000",
    GG: "#000000",
    MA: "#000000",
    MB: "#000000",
    MV: "#000000",
    PE: "#000000",
    RV: "#000000",
    SA: "#013220",
    SB: "#000000",
    SC: "#4CB4E7",
    SF: "#000000",
    SI: "#000000",
    SM: "#000000",
    SO: "#000000",
    SR: "#000000",
    SS: "#000000",
    ST: "#000000",
    TD: "#000000",
    TF: "#000000",
    UC: "#000000",
    VN: "#000000",
    WC: "#000000",
    WH: "#000000",
    VC: "#000000",
    AM: "#1E1B4B",
    BA: "#000000",
    AF: "#000000",
    "3D": "#000000",
  };
}

/**
 * Get realtime vehicle location data
 *
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
 * Save GTFS dataset as zip
 * Example files: trips.txt, stops.txt, routes.txt, calendar.txt, etc.
 * @param {string} operator=RG - operator's code name
 */
async function getGTFSDataFeed(operator = "RG") {
  try {
    const filename = `GTFSDataFeed_${operator}.zip`;
    const response = await axios({
      method: "get",
      url: `http://api.511.org/Transit/datafeeds?api_key=${process.env.API_KEY}&operator_id=${operator}`,
      responseType: "stream",
    });
    if (response.status === 200) {
      const dir = path.resolve(__dirname, "", filename);
      response.data.pipe(fs.createWriteStream(dir));
      response.data.on("end", () => {
        console.log("Download Completed");
      });
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get GTFS data, change text files to csv and save to directory.
 * @param {string} operator - operator's code name. Note: Default not all agencies due to file size.
 */
async function saveGTFSDataFeed(operator) {
  const GTFSDateFeedPath = path.join(__dirname, "GTFSDataFeeds", operator);
  await fs.promises.mkdir(GTFSDateFeedPath, { recursive: true });
  const file = `${__dirname}/GTFSDataFeed_${operator}.zip`;
  console.log(file);
  fs.readFile(file, async (error, data) => {
    if (!error) {
      const zip = JSZip();
      const contents = await zip.loadAsync(data);
      for (const filename of Object.keys(contents.files)) {
        const content = await zip.file(filename).async("nodebuffer");
        fs.writeFileSync(
          `${GTFSDateFeedPath}/${filename.split(".txt")[0]}.csv`,
          content
        );
      }
    }
  });
}

async function getOperatorGTFSDataFeed(operator) {
  try {
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
  getVehiclePositions,
  getTripUpdates,
  getGTFSDataFeed,
  saveGTFSDataFeed,
  getOperatorGTFSDataFeed,
};
