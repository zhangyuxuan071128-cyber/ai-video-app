import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { ControlPlaneError } from "./errors.mjs";

export const SCHEMA_VERSION = 1;

async function durableWriteJson(filePath, value) {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, filePath);
  try {
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch {
    // Some platforms do not support fsync on directories. The file itself was synced.
  }
}

function validateRoot(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new ControlPlaneError("DATA_CORRUPT", "控制平面数据文件格式无效", 500);
  }
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new ControlPlaneError(
      "SCHEMA_VERSION_UNSUPPORTED",
      `不支持的 schemaVersion: ${state.schemaVersion}`,
      500,
    );
  }
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new ControlPlaneError("DATA_CORRUPT", "控制平面 revision 无效", 500);
  }
  return state;
}

export class AtomicJsonStore {
  #filePath;
  #createInitialState;
  #state;
  #queue = Promise.resolve();

  constructor({ filePath, createInitialState }) {
    this.#filePath = filePath;
    this.#createInitialState = createInitialState;
  }

  get filePath() {
    return this.#filePath;
  }

  async init() {
    if (this.#state) return this;
    try {
      const source = await readFile(this.#filePath, "utf8");
      this.#state = validateRoot(JSON.parse(source));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const initial = validateRoot(await this.#createInitialState());
      await durableWriteJson(this.#filePath, initial);
      this.#state = initial;
    }
    return this;
  }

  async read(reader = (state) => state) {
    await this.init();
    await this.#queue;
    return reader(structuredClone(this.#state));
  }

  async transact(mutator) {
    await this.init();
    const operation = this.#queue.then(async () => {
      const draft = structuredClone(this.#state);
      const nextRevision = draft.revision + 1;
      const result = await mutator(draft, nextRevision);
      draft.revision = nextRevision;
      draft.updatedAt = new Date().toISOString();
      validateRoot(draft);
      await durableWriteJson(this.#filePath, draft);
      this.#state = draft;
      return { result, revision: nextRevision };
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }
}
