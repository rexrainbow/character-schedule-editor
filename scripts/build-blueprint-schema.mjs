import { writeFile } from 'node:fs/promises';
import { blueprintSchema } from '../src/core/blueprint/schema.js';
await writeFile(new URL('../src/schemas/blueprint.schema.json', import.meta.url), JSON.stringify(blueprintSchema, null, 2) + '\n');
