// Re-exports the global mock SQL instance seeded by setup.ts via vi.hoisted().
// Tests should import from here so they always operate on the same instance
// that the server module sees.

export const mockSql: any = (globalThis as any).__mockSql;
export function resetMockDb() { (globalThis as any).__resetMockDb(); }
