import { createApp } from './app.js';

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Configuration requires an integer between ${min} and ${max}.`);
  return number;
}

const app = await createApp({
  databasePath: process.env.DATABASE_PATH ?? './data/skillarena.sqlite',
  seed: process.env.SEED_DEMO !== 'false', logger: true,
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean),
  ai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, baseUrl: process.env.OPENAI_BASE_URL, timeoutMs: integer(process.env.AI_TIMEOUT_MS, 12000, 10, 60000) },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
}
try {
  await app.listen({ port: integer(process.env.PORT, 3001, 1, 65535), host: process.env.HOST ?? '127.0.0.1' });
} catch (error) {
  app.log.error(error); await app.close(); process.exitCode = 1;
}
