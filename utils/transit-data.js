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

async function getOperators() {
  try {
    const response = await axios.get(
      `http://api.511.org/transit/gtfsoperators?api_key=${process.env.API_KEY}`
    );
    return response.data;
  } catch (error) {
    console.log("getOperators");
    console.error(error);
  }
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
      `http://api.511.org/Transit/VehiclePositions?api_key=${process.env.API_KEY}&operator=${operator}`,
      { responseType: "arraybuffer" }
    );
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );
    return feed.entity;
  } catch (error) {
    console.log("vehiclePositions");
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
      `http://api.511.org/Transit/TripUpdates?api_key=${process.env.API_KEY}&operator=${operator}`,
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

async function getOperatorData(operator) {
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
            return resolve(files);
          });
        } catch (error) {
          return reject(error);
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
}

export {
  getOperators,
  getVehiclePositions,
  getTripUpdates,
  getGTFSDataFeed,
  saveGTFSDataFeed,
  getOperatorData,
};
