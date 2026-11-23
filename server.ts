import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './src/reconcile/app';
import { openDatabase } from './src/reconcile/db';
import { importAllCsvs } from './src/reconcile/importer';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  const db = openDatabase();
  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM system_a_records')
    .get() as { cnt: number };

  if (countRow.cnt === 0) {
    const summary = importAllCsvs(db);
    console.log(
      `[DealerOS] Initial CSV import complete — Locations: ${summary.locations.saved}/${summary.locations.read}, ` +
        `System A: ${summary.systemA.saved}/${summary.systemA.read}, ` +
        `System B: ${summary.systemB.saved}/${summary.systemB.read} ` +
        `(refs cleaned: ${summary.systemB.refsNormalized}, values left null: ${summary.systemB.valuesLeftNull})`,
    );
  }

  app.use('/api', createApiRouter(db));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DealerOS] Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[DealerOS] Fatal startup error:', err);
  process.exit(1);
});
