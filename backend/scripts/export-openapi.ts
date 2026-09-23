import { writeFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

const app = await createApp({ seed: false });
writeFileSync(new URL('../openapi.json', import.meta.url), JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
console.log('Exported backend/openapi.json');
