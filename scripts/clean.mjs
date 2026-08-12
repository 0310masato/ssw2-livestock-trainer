import { rm } from 'node:fs/promises';
for (const path of ['build', 'dist']) {
  await rm(path, { recursive: true, force: true });
}
