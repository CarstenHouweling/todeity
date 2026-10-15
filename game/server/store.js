// Safe JSON files for the server's data (saves.json, scores.json). A restart or deploy can kill the process at any
// moment, so a file is never written in place: the new contents go to `<file>.tmp`, are flushed to disk and then
// renamed over the old file (a rename is atomic), so the file is always either the old or the new version.
//
// Loading never quietly starts over: a missing file is a fresh start, but a file that doesn't parse falls back to
// the newest backup that does (and is kept aside as `<file>.corrupt-<time>`). With no good backup the server
// refuses to start, rather than writing an empty file over everyone's progress.
//
// Backups: `<file>.bak` is the previous version (every write), and `<dir>/backups/<name>-YYYY-MM-DD.json` one copy
// per day (the last BACKUP_DAYS days), made at startup and by the first write of the day.

import { copyFile, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const BACKUP_DAYS = 7;

const backupDir = (file) => join(dirname(file), 'backups');
const stem = (file) => basename(file).replace(/\.json$/, '');
const day = () => new Date().toISOString().slice(0, 10);

async function parseFile(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/** The backups of `file`, newest first: the previous version, then the daily copies. */
async function backups(file) {
  const previous = existsSync(`${file}.bak`) ? [`${file}.bak`] : [];
  try {
    const prefix = `${stem(file)}-`;
    const names = (await readdir(backupDir(file))).filter((name) => name.startsWith(prefix) && name.endsWith('.json'));
    return [...previous, ...names.sort().reverse().map((name) => join(backupDir(file), name))];
  } catch {
    return previous;
  }
}

/**
 * Reads a JSON file: `fallback()` when it doesn't exist yet. A broken file is replaced by its newest good backup;
 * throws when there is none (never start empty over real data).
 */
export async function loadJson(file, fallback) {
  try {
    return await parseFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Missing: a fresh start, unless a backup says there was data (the file was lost, not never written).
      if (!(await backups(file)).length) return fallback();
      console.error(`${file} is missing.`);
    } else {
      console.error(`${file} could not be read (${error.message}).`);
      await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => {});
    }
    for (const backup of await backups(file)) {
      try {
        const data = await parseFile(backup);
        console.error(`Restored ${file} from ${backup}.`);
        return data;
      } catch {
        // try an older one
      }
    }
    throw new Error(`${file} is broken and there is no good backup. Refusing to start with empty data.`);
  }
}

/** A daily backup of `file` (once per day, as soon as there is a file; old ones are pruned). */
async function backupOnce(file, state) {
  if (state.backedUp === day() || !existsSync(file)) return;
  state.backedUp = day();
  try {
    await mkdir(backupDir(file), { recursive: true });
    await copyFile(file, join(backupDir(file), `${stem(file)}-${day()}.json`));
    const daily = (await backups(file)).filter((path) => path.startsWith(backupDir(file)));
    for (const old of daily.slice(BACKUP_DAYS)) await unlink(old).catch(() => {});
  } catch (error) {
    console.error(`Backup of ${file} failed: ${error.message}`);
  }
}

/**
 * A JSON file written safely and one write at a time: `write(data)` queues a write (of the data as it is when the
 * write runs) and resolves when it is on disk; `flush()` waits for every queued write.
 */
export function jsonFile(file) {
  const state = { backedUp: null };
  let queue = Promise.resolve();
  const write = (data) => {
    queue = queue
      .then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await backupOnce(file, state);
        const tmp = `${file}.tmp`;
        const handle = await open(tmp, 'w');
        try {
          await handle.writeFile(JSON.stringify(data));
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (existsSync(file)) await copyFile(file, `${file}.bak`); // the previous version
        await rename(tmp, file);
        await backupOnce(file, state); // (the first file of a new data folder gets its backup right away)
      })
      .catch((error) => console.error(`Writing ${file} failed: ${error.message}`));
    return queue;
  };
  return {
    file,
    load: async (fallback) => {
      const data = await loadJson(file, fallback);
      await backupOnce(file, state); // a known-good copy of what we start with
      return data;
    },
    write,
    flush: () => queue,
  };
}
