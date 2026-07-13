import { Router } from 'express';
import { requireAuth, requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as itemCatalogController from './item-catalog.controller.js';

export const itemCatalogRouter: Router = Router();

itemCatalogRouter.use(requireAuth, requireEnterpriseAdmin);
itemCatalogRouter.get('/', itemCatalogController.list);
itemCatalogRouter.post('/', itemCatalogController.create);
itemCatalogRouter.put('/:id', itemCatalogController.update);
itemCatalogRouter.delete('/:id', itemCatalogController.remove);
