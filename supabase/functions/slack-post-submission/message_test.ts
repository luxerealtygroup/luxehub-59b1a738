import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildMessage, collectFiles } from '../_shared/submissionSlackMessage.ts';

Deno.test('all four submission types produce their own type-specific fields', () => {
  for (const [form_type,key,value] of [['open_house','second_time','14:00 - 16:00'],['listing','seller_emails','seller@example.test'],['buyer','condition_due_financing','2026-12-01'],['invoice','vendor_name','Example vendor']]) {
    const message = buildMessage({ id:'fixture',form_type,[key]:value });
    assertStringIncludes(message.text,value);
    assertStringIncludes(message.text,'Submitted via LUXEhub');
  }
});
Deno.test('file collection includes IDs as files, not message previews', () => {
  const row = {id:'fixture',form_type:'buyer',ids_files:['private/identity.pdf'],invoice_file_path:'private/invoice.pdf'};
  assertEquals(collectFiles(row).length,2);
  assertEquals(buildMessage(row).text.includes('identity.pdf'),false);
});