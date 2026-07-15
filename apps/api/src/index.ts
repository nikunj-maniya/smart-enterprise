import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import type { HealthResponse } from '@se/shared';
import { initSocketServer } from './lib/socket.js';
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
import { formsRouter } from './modules/forms/forms.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { escalationRulesRouter } from './modules/escalation-rules/escalation-rules.routes.js';
import { leaveTypesRouter } from './modules/leave-types/leave-types.routes.js';
import { holidaysRouter } from './modules/holidays/holidays.routes.js';
import { leaveBalancesRouter } from './modules/leave-balances/leave-balances.routes.js';
import { frontDeskRouter } from './modules/front-desk/front-desk.routes.js';
import { itemCatalogRouter } from './modules/item-catalog/item-catalog.routes.js';
import { absencesRouter } from './modules/absences/absences.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { slackConfigRouter } from './modules/slack/slack-config.routes.js';
import { slackWebhookRouter } from './modules/slack/slack-webhook.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { directoryRouter } from './modules/directory/directory.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { enterpriseProfileRouter } from './modules/enterprise-profile/enterprise-profile.routes.js';
import {
  selfRegistrationRouter,
  publicSelfRegistrationRouter,
} from './modules/self-registration/self-registration.routes.js';
import { errorHandler } from './middleware/error.js';
import { globalRateLimiter, authRateLimiter } from './middleware/rate-limit.js';
import { scheduleAutoCompleteRequestsJob } from './jobs/auto-complete-requests.job.js';
import { scheduleApprovalRemindersJob } from './jobs/approval-reminders.job.js';
import { scheduleEscalationSweepJob } from './jobs/escalation-sweep.job.js';
import { startSlackDeliveryWorker } from './jobs/slack-delivery.job.js';
import { scheduleSlackDigestJob } from './jobs/slack-digest.job.js';

const app = express();
app.use(cors());
// Slack's interaction signature is an HMAC over the exact raw bytes of the request — it must be
// captured before the global JSON parser would otherwise consume/reserialize the body, and Slack
// posts this endpoint as form-urlencoded, not JSON, so express.json() below leaves it untouched.
app.use('/slack/interactions', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(globalRateLimiter);

app.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'smart-enterprise-api',
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

app.use('/auth', authRateLimiter, authRouter);
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
app.use('/forms', formsRouter);
app.use('/requests', requestsRouter);
app.use('/escalation-rules', escalationRulesRouter);
app.use('/leave-types', leaveTypesRouter);
app.use('/holidays', holidaysRouter);
app.use('/leave-balances', leaveBalancesRouter);
app.use('/front-desk', frontDeskRouter);
app.use('/item-catalog', itemCatalogRouter);
app.use('/absences', absencesRouter);
app.use('/search', searchRouter);
app.use('/slack/config', slackConfigRouter);
app.use('/slack/interactions', slackWebhookRouter);
app.use('/reports', reportsRouter);
app.use('/directory', directoryRouter);
app.use('/profile', profileRouter);
app.use('/enterprise-profile', enterpriseProfileRouter);
app.use('/self-registration', selfRegistrationRouter);
app.use('/public/self-registration', authRateLimiter, publicSelfRegistrationRouter);

app.use(errorHandler);

const port = Number(process.env.API_PORT ?? 4000);
const httpServer = createServer(app);
initSocketServer(httpServer);
httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

scheduleAutoCompleteRequestsJob().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to schedule auto-complete-requests job', err);
});

scheduleApprovalRemindersJob().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to schedule approval-reminders job', err);
});

scheduleEscalationSweepJob().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to schedule escalation-sweep job', err);
});

startSlackDeliveryWorker();

scheduleSlackDigestJob().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to schedule slack-digest job', err);
});
