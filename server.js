import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config();
import * as cron from "node-cron";
import {
  connectDB,
  getOperators,
  getOperator,
  getActiveOperators,
  getPositions,
  updatePositions,
  getShapeCoordinates,
  getAllShapeCoordinates,
  getOperatorTripStops,
} from "./utils/sqlite.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.listen(port, () => {
  console.log(`Dashaboard listening on port ${port}`);
});

const db = connectDB();

await updatePositions(db);
cron.schedule("*/1 * * * *", async () => {
  await updatePositions(db);
});

app.get("/positions", async (req, res) => {
  try {
    const positions = await getPositions(db, req.query.operator);
    res.send(positions);
  } catch (error) {
    console.error(error);
  }
});

app.get("/shapes", async (req, res) => {
  try {
    const tripCoordinates = await getShapeCoordinates(
      db,
      req.query.operator,
      req.query.shapeId
    );
    res.send(tripCoordinates);
  } catch (error) {
    console.error(error);
  }
});

app.get("/operators", async (req, res) => {
  const data = await getOperators(db);
  res.send(data);
});

app.get("/operator", async (req, res) => {
  const data = await getOperator(db, req.query.operator);
  res.send(data);
});

app.get("/active-operators", async (req, res) => {
  const data = await getActiveOperators(db);
  res.send(data);
});

app.post("/shapes", async (req, res) => {
  const operator = req.body.operator;
  const shapeIds = req.body.shapeIds;
  const data = await getAllShapeCoordinates(db, operator, shapeIds);
  res.send(data);
});

app.post("/trip-stops", async (req, res) => {
  const operator = req.body.operator;
  const tripIds = req.body.tripIds;
  const data = await getOperatorTripStops(db, operator, tripIds);
  res.send(data);
});
