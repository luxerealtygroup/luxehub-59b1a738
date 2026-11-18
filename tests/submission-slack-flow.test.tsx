import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SubmissionsTab } from '../src/components/submissions/SubmissionsTab';

const mocks = vi.hoisted(() => ({ invoke:vi.fn(),success:vi.fn(),warning:vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase:{ functions:{ invoke:mocks.invoke } } }));
vi.mock('@/lib/agentOptions', () => ({ fetchAgentOptions:async () => [] }));
vi.mock('sonner', () => ({ toast:{ success:mocks.success,warning:mocks.warning,error:vi.fn() } }));
vi.mock('../src/components/submissions/SlackDestinations', () => ({ SlackDestinations:() => null }));
vi.mock('../src/components/submissions/SlackSyncAlert', () => ({ SlackSyncAlert:() => null }));
vi.mock('../src/components/submissions/OpenHouseForm', () => ({ OpenHouseForm:({onSuccess}:any) => <button onClick={() => onSuccess({submission_id:'saved-open-house'})}>Save open house fixture</button> }));
vi.mock('../src/components/submissions/ListingForm', () => ({ ListingForm:({onSuccess}:any) => <button onClick={() => onSuccess({submission_id:'saved-listing'})}>Save listing fixture</button> }));
vi.mock('../src/components/submissions/BuyerForm', () => ({ BuyerForm:({onSuccess}:any) => <button onClick={() => onSuccess({submission_id:'saved-buyer'})}>Save buyer fixture</button> }));
vi.mock('../src/components/submissions/InvoiceForm', () => ({ InvoiceForm:({onSuccess}:any) => <button onClick={() => onSuccess({submission_id:'saved-invoice'})}>Save invoice fixture</button> }));
afterEach(() => { cleanup();vi.clearAllMocks(); });

describe('saved submissions trigger Slack only', () => {
  it.each([['Open House','open house','saved-open-house'],['Listing','listing','saved-listing'],['Buyer','buyer','saved-buyer'],['Invoice','invoice','saved-invoice']])
  ('passes the saved %s row ID, never an Asana request',async (tab,label,id) => {
    mocks.invoke.mockResolvedValue({data:{ok:true},error:null});
    render(<SubmissionsTab />);
    fireEvent.mouseDown(screen.getByRole('tab',{name:tab}),{button:0,ctrlKey:false});
    fireEvent.click(await screen.findByText(`Save ${label} fixture`));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('slack-post-submission',{body:{action:'post',submission_id:id}}));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Posted to Slack'));
  });
  it('a Slack failure warns without rejecting the saved form callback',async () => {
    mocks.invoke.mockRejectedValue(new Error('Offline'));
    render(<SubmissionsTab />);
    fireEvent.click(screen.getByText('Save open house fixture'));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith('Submission saved, but the Slack post failed. The office has been notified in the sync alert.'));
    expect(screen.getByText('Save open house fixture')).toBeTruthy();
  });
  it('an unconfigured invoice destination produces no success or failure notice',async () => {
    mocks.invoke.mockResolvedValue({data:{skipped:true,reason:'no_channel_configured'},error:null});
    render(<SubmissionsTab />);
    fireEvent.click(screen.getByText('Save open house fixture'));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.success).not.toHaveBeenCalled();expect(mocks.warning).not.toHaveBeenCalled();
  });
});