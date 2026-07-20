import { vi } from 'vitest';
import { createMockSql } from './mockDb';

// Create a SINGLE mock sql instance up-front (vi.hoisted guarantees it is shared
// by the @neondatabase/serverless mock factory and any test that reads the global),
// avoiding the dual-instance problem where the app and the test seed different stores.
const mocks = vi.hoisted(() => ({ mockSql: createMockSql() }));

vi.stubGlobal('__mockSql', mocks.mockSql);
vi.stubGlobal('__resetMockDb', () => mocks.mockSql.reset());

vi.mock('@neondatabase/serverless', () => ({
  neon: () => mocks.mockSql,
}));
