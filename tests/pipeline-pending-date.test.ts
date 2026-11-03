import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@lovable.dev/mcp-js', () => ({ defineTool: (tool: unknown) => tool }));
import addPipelineClient from '../src/lib/mcp/tools/add-pipeline-client';

// Execute the actual page handlers in isolation, without mounting unrelated
// dashboard widgets or making live writes to the team's client records.
function pageHandler(path: string, name: string, scope: Record<string, unknown>) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && ts.isArrowFunction(node.initializer)) {
      handler = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!handler) throw new Error(`Missing handler ${name}`);
  const code = ts.transpileModule(`const handler = ${handler.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(scope), `${code}; return handler;`)(...Object.values(scope));
}

describe('required pipeline pending dates', () => {
  const paths = [
    ['src/pages/Pipeline.tsx', 'handleAddClient', 'insert'],
    ['src/pages/Pipeline.tsx', 'handleUpdateClient', 'update'],
    ['src/pages/Dashboard.tsx', 'handleAddClient', 'insert'],
  ] as const;

  for (const [path, handlerName, operation] of paths) {
    it(`${path} ${handlerName} blocks blank dates and saves a supplied date`, async () => {
      const result = { data: { id: 'client-1' }, error: null };
      const chain = { select: () => chain, single: async () => result, eq: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      const write = vi.fn(() => chain);
      const toast = vi.fn();
      const client: Record<string, unknown> = { id: 'client-1', client_name: 'Test client', client_type: 'buyer', stage: '1', expected_pending_date: '' };
      const scope = {
        user: { id: 'agent-1' }, newClient: client, editingClient: client,
        clients: [], toast, supabase: { from: () => ({ [operation]: write }) },
        calculateGCI: () => 0, isAdmin: false, assignedAgentId: '', teamAgents: [],
        setSubmitting: vi.fn(), syncToFUB: false, setSyncToFUB: vi.fn(),
        setAddClientOpen: vi.fn(), setAddDialogOpen: vi.fn(), setNewClient: vi.fn(),
        setEditingClient: vi.fn(), fetchClients: vi.fn(),
      };
      const handler = pageHandler(path, handlerName, scope);
      for (const blank of [undefined, null, '', '   ']) {
        client.expected_pending_date = blank;
        await handler({ preventDefault: vi.fn() });
        expect(write).not.toHaveBeenCalled();
        expect(toast.mock.lastCall?.[0].variant).toBe('destructive');
      }
      client.expected_pending_date = '2026-12-01';
      await handler({ preventDefault: vi.fn() });
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0]?.[0]).toMatchObject({ expected_pending_date: '2026-12-01' });
    });
  }

  it('MCP requires a trimmed YYYY-MM-DD date and rejects missing or malformed dates', () => {
    const schema = z.object(addPipelineClient.inputSchema);
    for (const date of [undefined, null, '', '   ', '2026-1-01', '12/01/2026']) {
      expect(schema.safeParse({ client_name: 'Test client', expected_pending_date: date }).success).toBe(false);
    }
    expect(schema.parse({ client_name: 'Test client', expected_pending_date: ' 2026-12-01 ' }).expected_pending_date).toBe('2026-12-01');
  });
});