import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DemoWorkspace from '../src/components/DemoWorkspace';

const { databaseRead } = vi.hoisted(() => ({ databaseRead: vi.fn(() => { throw new Error('Demo must not read live data'); }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: databaseRead } }));
afterEach(cleanup);

describe('demo data isolation', () => {
  it.each(['/dashboard/admin', '/dashboard/pipeline', '/dashboard/commissions', '/dashboard/goals', '/dashboard/411', '/dashboard/admin/business-planning', '/dashboard/settings'])
  ('does not query team data on %s', path => {
    render(<MemoryRouter initialEntries={[path]}><DemoWorkspace /></MemoryRouter>);
    expect(databaseRead).not.toHaveBeenCalled();
  });
  it('uses fabricated agents for team coaching', () => {
    render(<MemoryRouter initialEntries={['/dashboard/admin']}><DemoWorkspace /></MemoryRouter>);
    expect(screen.getByText('Alex Morgan')).toBeTruthy();
    expect(screen.queryByText('Melissa Carter')).toBeNull();
    expect(screen.getByText('$492,500')).toBeTruthy();
  });
});