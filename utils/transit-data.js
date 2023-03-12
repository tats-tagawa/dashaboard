import fs from 'fs';
import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { fileURLToPath } from 'url';
import path from 'path';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getOperators = async () => {
  try {
    const response = await axios.get(
      `http://api.511.org/transit/gtfsoperators?api_key=${process.env.API_KEY}`
    )
    return response.data
  } catch (error) {
    console.log('getOperators');
    console.error(error);
  }
}

/**
 * Get realtime vehicle location data
 *  
 * @param {string} agency=RG - Agency's code name
 * @returns {object} JSON object
 */
const getVehiclePositions = async (agency = 'RG') => {
  try {
    const response = await axios.get(
      `http://api.511.org/Transit/VehiclePositions?api_key=${process.env.API_KEY}&agency=${agency}`, { responseType: 'arraybuffer' });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );
    return feed.entity;
  } catch (error) {
    console.log('vehiclePositions');
    console.error(error);
  }
}

/**
 * Get ETA/names of upcoming stops for vehicles
 * @param {string} agency=RG - Agency's code name
 * @returns {object} JSON object
 */
const getTripUpdates = async (agency = 'RG') => {
  try {
    const response = await axios.get(
      `http://api.511.org/Transit/TripUpdates?api_key=${process.env.API_KEY}&agency=${agency}`
      , { responseType: 'arraybuffer' });
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
 * @param {string} agency=RG - Agency's code name
 */
const getGTFSDataFeed = async (agency = 'RG') => {
  try {
    const filename = `GTFSDataFeed_${agency}.zip`;
    const response = await axios({
      method: 'get',
      url: `http://api.511.org/Transit/datafeeds?api_key=${process.env.API_KEY}&operator_id=${agency}`,
      responseType: 'stream',
    })
    if (response.status === 200) {
      const dir = path.resolve(__dirname, '', filename);
      response.data.pipe(fs.createWriteStream(dir));
      response.data.on('end', () => {
        console.log('Download Completed');
      });
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get GTFS data, change text files to csv and save to directory. 
 * @param {string} agency - Agency's code name. Note: Default not all agencies due to file size.
 */
const saveGTFSDataFeed = async (agency) => {
  const GTFSDateFeedPath = path.join(__dirname, 'GTFSDataFeeds', agency);
  await fs.promises.mkdir(GTFSDateFeedPath, { recursive: true })
  const file = `${__dirname}/GTFSDataFeed_${agency}.zip`;
  fs.readFile(file, async (error, data) => {
    if (!error) {
      const zip = JSZip();
      const contents = await zip.loadAsync(data)
      Object.keys(contents.files).forEach(async (filename) => {
        const content = await zip.file(filename).async('nodebuffer');
        fs.writeFileSync(`${GTFSDateFeedPath}/${filename.split('.txt')[0]}.csv`, content);
      })
    };
  })
}

export { getOperators, getVehiclePositions, getTripUpdates, getGTFSDataFeed, saveGTFSDataFeed }