import { rm } from 'node:fs/promises';

// Branches can contain different tests or assets; never package stale output.
await rm('dist', { recursive: true, force: true });
