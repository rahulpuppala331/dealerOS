import express, { type Request, type Response, type Router } from 'express';
import { getSavedImportSummary, importAllCsvs } from './importer';
import type { SqliteDatabase } from './db';
import {
  getOrgSummary,
  InvalidOrgError,
  InvalidQueryError,
  listOrgs,
  queryDisagreements,
} from './service';

function firstQueryParam(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Express API router bound to a SQLite database instance.
 */
export function createApiRouter(db: SqliteDatabase): Router {
  const router = express.Router();

  router.get('/orgs', (_req: Request, res: Response) => {
    const orgs = listOrgs(db);
    res.json({ orgs });
  });

  router.get('/disagreements', (req: Request, res: Response) => {
    try {
      const result = queryDisagreements(db, {
        org: firstQueryParam(req.query.org),
        reason: firstQueryParam(req.query.reason),
        sort: firstQueryParam(req.query.sort),
      });
      res.json(result);
    } catch (error) {
      if (error instanceof InvalidOrgError || error instanceof InvalidQueryError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error querying disagreements:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/summary', (req: Request, res: Response) => {
    try {
      const summary = getOrgSummary(db, firstQueryParam(req.query.org));
      res.json(summary);
    } catch (error) {
      if (error instanceof InvalidOrgError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error building summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/import-report', (_req: Request, res: Response) => {
    const summary = getSavedImportSummary(db);
    if (!summary) {
      res.status(404).json({ error: 'No import has been run yet.' });
      return;
    }
    res.json(summary);
  });

  router.post('/reimport', (_req: Request, res: Response) => {
    try {
      const summary = importAllCsvs(db);
      res.json(summary);
    } catch (error) {
      console.error('Re-import failed:', error);
      res.status(500).json({ error: 'Failed to re-import CSV files.' });
    }
  });

  return router;
}
