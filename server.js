import express from 'express';
import axios from 'axios';
import cors from 'cors';
import * as dotenv from 'dotenv';
dotenv.config();
import { connectDB, getPositions } from './utils/sqlite.js'
import realtime from './routes/transit-realtime.js';
import info from './routes/transit-info.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/realtime', realtime);
app.use('/info', info);

app.listen(port, () => {
  console.log(`Dashaboard listening on port ${port}`);
});

const db = connectDB();
app.get('/positions', async (req, res) => {
  const positions = await getPositions(db);
  res.send(positions)
})