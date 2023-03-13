import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
dotenv.config();
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
