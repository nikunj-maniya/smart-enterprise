import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as directoryController from './directory.controller.js';

// Open to any authenticated tenant user (not admin-gated) — user-picker/project-picker
// fields must resolve for whoever is filling out a form, not just admins.
export const directoryRouter: Router = Router();

directoryRouter.use(requireAuth);
directoryRouter.get('/users', directoryController.users);
directoryRouter.get('/projects', directoryController.projects);
