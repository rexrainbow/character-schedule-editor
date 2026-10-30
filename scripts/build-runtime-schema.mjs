import { writeFile } from 'node:fs/promises';
import { runtimeProgramSchema } from '../src/runtime/programSchema.js';
await writeFile(new URL('../src/schemas/runtime.schema.json', import.meta.url), JSON.stringify(runtimeProgramSchema, null, 2) + '\n');
