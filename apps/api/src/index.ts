import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import type { HealthResponse } from '@se/shared';
import { authRouter } from './modules/auth/auth.routes.js';
import { registrationsRouter } from './modules/registrations/registrations.routes.js';
import { overviewRouter } from './modules/overview/overview.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { enterprisesRouter } from './modules/enterprises/enterprises.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { auditLogRouter } from './modules/audit-log/audit-log.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { departmentsRouter } from './modules/departments/departments.routes.js';
import { rolesRouter } from './modules/roles/roles.routes.js';
import { orgUsersRouter } from './modules/org-users/org-users.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import {
  selfRegistrationRouter,
  publicSelfRegistrationRouter,
} from './modules/self-registration/self-registration.routes.js';
import { errorHandler } from './middleware/error.js';

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

app.use('/auth', authRouter);
app.use('/registrations', registrationsRouter);
app.use('/overview', overviewRouter);
app.use('/notifications', notificationsRouter);
app.use('/enterprises', enterprisesRouter);
app.use('/users', usersRouter);
app.use('/audit-log', auditLogRouter);
app.use('/settings', settingsRouter);
app.use('/departments', departmentsRouter);
app.use('/roles', rolesRouter);
app.use('/org-users', orgUsersRouter);
app.use('/projects', projectsRouter);
app.use('/profile', profileRouter);
app.use('/self-registration', selfRegistrationRouter);
app.use('/public/self-registration', publicSelfRegistrationRouter);

app.use(errorHandler);

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
