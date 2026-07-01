import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import type { HealthResponse } from '@se/shared';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'smart-enterprise-api',
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
