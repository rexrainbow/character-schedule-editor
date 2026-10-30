import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schemas/runtime.schema.json' with { type: 'json' };
import { Program, Runtime } from '../runtime/index.js';
import { compileProject } from './model.js';

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
export function validateRuntimeDocument(data) {
  if (!validate(data)) return validate.errors.map((error) => ({ path: error.instancePath || '/', key: `schema_${error.keyword}`, field: error.params.missingProperty ?? error.params.additionalProperty ?? '' }));
  try { new Runtime({ program: Program.fromJSON(data) }); return []; }
  catch (error) { return [{ path: error.path ?? '/', key: error.code ?? 'invalidRuntimeProgram', ref: error.ref }]; }
}

/** One executable format for GUI, API, MCP and standalone runtime hosts. */
export function compileRuntime(draft, { referenceMode = 'name' } = {}) {
  const checked = compileProject(draft);
  if (checked.errors.length) return { data: null, errors: checked.errors };
  try {
    const data = Program.fromProject(draft, { referenceMode }).toJSON();
    const errors = validateRuntimeDocument(data);
    return { data: errors.length ? null : data, errors };
  } catch (error) { return { data: null, errors: error.issues ?? [{ path: error.path ?? '/', key: error.code ?? 'invalidRuntimeProgram' }] }; }
}
