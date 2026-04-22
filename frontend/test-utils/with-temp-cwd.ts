import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function withTempCwd<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eidoz-test-"));

  process.chdir(tempDir);
  try {
    return await run();
  } finally {
    process.chdir(previous);
    await rm(tempDir, { recursive: true, force: true });
  }
}
