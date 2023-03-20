import express from "express";
import axios from "axios";
import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config();
import * as cron from "node-cron";
import {
  connectDB,
  getOperators,
  getPositions,
  updatePositions,
  getTripShapeId,
  getShapeCoordinates,
} from "./utils/sqlite.js";
import realtime from "./routes/transit-realtime.js";
import info from "./routes/transit-info.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/realtime", realtime);
app.use("/info", info);

app.listen(port, () => {
  console.log(`Dashaboard listening on port ${port}`);
});

const db = connectDB();

cron.schedule("30 * * * * *", async () => {
  await updatePositions(db)
})

app.get("/positions", async (req, res) => {
  const positions = await getPositions(db, req.query.operator);
  res.send(positions);
});

app.get("/shapes", async (req, res) => {
  const data = await getTripShapeId(db, req.query.tripId);
  const tripCoordinates = await getShapeCoordinates(db, data.shape_id);
  res.send(tripCoordinates);
});

app.get("/operators", async (req, res) => {
  const data = await getOperators(db);
  res.send(data)
})