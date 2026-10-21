import { readFile, realpath, stat, open, rename, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename, extname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function serviceError(code, message, path = '') {
  return Object.assign(new Error(message), { code, path });
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** All paths are resolved against an explicit local project directory. */
export async function createProjectFiles(rootDirectory) {
  const root = await realpath(resolve(rootDirectory));
  if (!(await stat(root)).isDirectory()) throw serviceError('invalidRoot', 'The project root must be a directory.');
  function inside(path) {
    const part = relative(root, path);
    if (part === '..' || part.startsWith(`..\\`) || part.startsWith('../') || isAbsolute(part)) throw serviceError('outsideProjectRoot', 'Path must stay inside the configured project root.', path);
    return path;
  }
  async function pathFor(input, extension = '.json') {
    if (typeof input !== 'string' || !input.trim()) throw serviceError('invalidPath', 'Supply a file path.');
    const path = inside(resolve(root, input));
    if (extname(path).toLowerCase() !== extension) throw serviceError('invalidExtension', `Expected a ${extension} file.`, input);
    // Resolve symlinks/junctions before accessing either an existing or new file.
    try { return inside(await realpath(path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return inside(join(await realpath(dirname(path)), basename(path)));
  }
  async function bytesAt(path) {
    try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return {
    root, pathFor,
    async readText(input, extension = '.yaml') {
      const path = await pathFor(input, extension);
      return { path, text: await readFile(path, 'utf8') };
    },
    async readProject(input) {
      const path = await pathFor(input), bytes = await readFile(path);
      let data;
      try { data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
      catch { throw serviceError('invalidJson', 'The file does not contain valid JSON.', path); }
      return { path, data, hash: hash(bytes) };
    },
    async write(input, content, { extension = '.json', expectedHash, overwrite = false } = {}) {
      const path = await pathFor(input, extension);
      function check(bytes) {
        if (expectedHash !== undefined) {
          if ((bytes === null ? null : hash(bytes)) !== expectedHash) throw serviceError('fileChanged', 'The file changed outside this service. Reopen it or save to another path.', path);
        } else if (bytes !== null && !overwrite) throw serviceError('fileExists', 'The destination exists. Use overwrite:true or another path.', path);
      }
      check(await bytesAt(path));
      const temp = join(dirname(path), `.${randomUUID()}.tmp`);
      try {
        const handle = await open(temp, 'wx');
        try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        check(await bytesAt(path));
        await rename(temp, path);
      } finally { await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
      return { path, hash: hash(Buffer.from(content, 'utf8')) };
    },
  };
}
