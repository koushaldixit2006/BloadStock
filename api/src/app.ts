import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { httpLogger } from './utils/logger';
import { generalLimiter } from './middlewares/rateLimiter';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

import authRoutes from './routes/auth.routes';
import hospitalRoutes from './routes/hospital.routes';
import routeRoutes from './routes/route.routes';
import inventoryRoutes from './routes/inventory.routes';
import requestRoutes from './routes/request.routes';
import reservationRoutes from './routes/reservation.routes';
import scenarioRoutes from './routes/scenario.routes';
import simulationRoutes from './routes/simulation.routes';
import auditRoutes from './routes/audit.routes';
import invariantRoutes from './routes/invariant.routes';
import metricsRoutes from './routes/metrics.routes';
import planRoutes from './routes/plan.routes';

export const app = express();

// Security & Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow CDN resources for Swagger UI at /docs
  })
);
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(httpLogger);
app.use(generalLimiter);

// Public Health Check
app.get('/health', (_req: Request, res: Response) => {
  const mongoState = mongoose.connection.readyState;
  const isHealthy = mongoState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'api',
    mongo: {
      readyState: mongoState,
      status: mongoState === 1 ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

// Swagger UI & OpenAPI Specification
app.get('/docs/openapi.yaml', (_req: Request, res: Response) => {
  const possiblePaths = [
    path.resolve(__dirname, '../../openapi.yaml'),
    path.resolve(__dirname, '../../../openapi.yaml'),
    path.resolve(process.cwd(), 'openapi.yaml'),
    path.resolve(process.cwd(), '../openapi.yaml'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      res.setHeader('Content-Type', 'text/yaml');
      return res.sendFile(p);
    }
  }
  return res.status(404).send('OpenAPI specification not found');
});

app.get('/docs', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>BloodStock Planning API - OpenAPI Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function() {
        SwaggerUIBundle({
          url: '/docs/openapi.yaml',
          dom_id: '#swagger-ui',
          deepLinking: true
        });
      };
    </script>
  </body>
</html>`);
});

// Root Welcome & Disclaimer
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'BloodStock Planning API',
    version: '1.0.0',
    disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
  });
});

// API Routes (/api/v1)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/hospitals', hospitalRoutes);
app.use('/api/v1/routes', routeRoutes);
app.use('/api/v1', inventoryRoutes); // mounts /units and /inventory/summary
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/reservations', reservationRoutes);
app.use('/api/v1/scenarios', scenarioRoutes);
app.use('/api/v1/sim', simulationRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/invariants', invariantRoutes);
app.use('/api/v1/metrics', metricsRoutes);
app.use('/api/v1/plans', planRoutes);

// Direct Aliases for ergonomics (e.g. /audit/verify, /invariants, /sim/clock)
app.use('/audit', auditRoutes);
app.use('/invariants', invariantRoutes);
app.use('/sim', simulationRoutes);
app.use('/reservations', reservationRoutes);
app.use('/scenarios', scenarioRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
