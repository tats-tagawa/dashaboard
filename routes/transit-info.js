import axios from "axios";
import express from "express";
import { getTripUpdates } from "../utils/transit-data.js";

const info = express.Router();

info.get("/operators", (req, res) => {
  axios
    .get(
      `http://api.511.org/transit/gtfsoperators?api_key=${process.env.API_KEY}`
    )
    .then((response) => {
      res.json(response.data);
    })
    .catch((error) => {
      console.log(error);
    });
});

info.get("/getTripUpdates", async (req, res) => {
  res.json(await getTripUpdates());
});

export default info;
