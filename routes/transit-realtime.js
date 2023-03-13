import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import express from 'express';

const realtime = express.Router();

realtime.get('/position', (req, res) => {
  axios.get(
    `http://api.511.org/Transit/VehiclePositions?api_key=${process.env.API_KEY}&agency=${req.query.agency}`,
    { responseType: 'arraybuffer' })
    .then((response) => {
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(response.data)
      );
      res.json(feed.entity);
    })
    .catch((error) => {
      console.log(error)
    })
})

realtime.get('/trip-updates/', (req, res) => {
  axios.get(
    `http://api.511.org/Transit/TripUpdates?api_key=${process.env.API_KEY}&agency=${req.query.agency}`,
    { responseType: 'arraybuffer' })
    .then((response) => {
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(response.data)
      );
      res.json(feed.entity);
    })
    .catch((error) => {
      console.log(error)
    })
})

export default realtime;