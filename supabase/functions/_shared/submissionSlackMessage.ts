export const TYPE_LABELS: Record<string, string> = { open_house: 'Open House', listing: 'Listing', buyer: 'Buyer', invoice: 'Invoice' };
const common = [['agent_name', 'Agent'], ['client_name', 'Client'], ['property_address', 'Property address'], ['submission_type', 'Submission type']];
const fields: Record<string, string[][]> = {
  open_house: [['open_house_date','Date'],['open_house_time','Time'],['second_date','Second date'],['second_time','Second time'],['door_knockers_needed','Door knockers needed'],['door_knockers_quantity','Door knockers quantity'],['feature_sheets_needed','Feature sheets'],['bmo_rep_needed','BMO rep'],['bmo_flyers_needed','BMO flyers'],['vendor_name','Vendor'],['notes','Notes']],
  listing: [['seller_names','Seller names'],['seller_emails','Seller emails'],['seller_phones','Seller phones'],['list_price','List price'],['listing_date','Listing date'],['photography_package','Photography package'],['staging_consult','Staging consult'],['occupancy','Occupancy'],['door_knockers','Door knockers'],['feature_sheets','Feature sheets'],['listing_notes','Listing notes'],['notes','Notes']],
  buyer: [['buyer_names','Buyer names'],['buyer_emails','Buyer emails'],['buyer_phones','Buyer phones'],['lender_name_contact','Lender'],['purchase_price','Purchase price'],['closing_date','Closing date'],['firm_price','Firm price'],['conditional_price','Conditional price'],['condition_due_sbp','Sale of buyer property due'],['condition_due_financing','Financing due'],['condition_due_status','Status certificate due'],['condition_due_home_inspection','Home inspection due'],['condition_due_other','Other condition due'],['condition_other_description','Other condition'],['cooperating_commission','Cooperating commission'],['notes','Notes']],
  invoice: [['vendor_type','Vendor type'],['vendor_name','Vendor name'],['invoice_amount','Amount'],['invoice_date','Invoice date'],['notes','Notes']],
};
const amounts = new Set(['list_price','purchase_price','firm_price','conditional_price','invoice_amount']);
export function buildMessage(row: Record<string, unknown>) {
  const title = `${TYPE_LABELS[String(row.form_type)] || 'New'} submission`;
  const details = [...common, ...(fields[String(row.form_type)] || [])].flatMap(([key,label]) => {
    const value = row[key];
    if (value == null || value === '') return [];
    const text = typeof value === 'boolean' ? value ? 'Yes' : 'No' : amounts.has(key) && Number.isFinite(Number(value))
      ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(Number(value)) : String(value);
    return [`${label}: ${text}`];
  });
  const blocks: Record<string, unknown>[] = [{ type: 'header', text: { type: 'plain_text', text: title } }];
  const chunks = details.flatMap(text => Array.from({ length: Math.ceil(text.length / 1900) }, (_, i) => text.slice(i * 1900, (i + 1) * 1900)));
  for (let i = 0; i < chunks.length; i += 10) blocks.push({ type: 'section', fields: chunks.slice(i,i+10).map(text => ({ type: 'plain_text', text })) });
  blocks.push({ type: 'context', elements: [{ type: 'plain_text', text: `Submitted via LUXEhub · Submission ${row.id}` }] });
  return { text: [title, ...details, `Submitted via LUXEhub · Submission ${row.id}`].join('\n').slice(0,39000), blocks: blocks.slice(0,50) };
}
export function collectFiles(row: Record<string, unknown>): { path: string; name: string }[] {
  const refs = ['attachments','bra_reco_files','ids_files','fintracker_files','other_docs_files'].flatMap(key => Array.isArray(row[key]) ? row[key] as unknown[] : []);
  if (row.invoice_file_path) refs.push(row.invoice_file_path);
  const result = new Map<string, { path: string; name: string }>();
  for (const ref of refs) {
    const value = typeof ref === 'string' ? { path: ref } : ref && typeof ref === 'object' ? ref as { path?: string; name?: string } : null;
    if (!value?.path || /^https?:/i.test(value.path)) continue;
    result.set(value.path, { path: value.path, name: value.name || value.path.split('/').pop() || 'file' });
  }
  return [...result.values()];
}