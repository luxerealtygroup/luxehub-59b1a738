-- Fix typo'd far-future date that crashed Hana's pipeline page
UPDATE public.pipeline_clients
SET expected_pending_date = '2026-09-15'
WHERE id = 'ba89efc1-3b1e-4169-af30-ee44f7d915e1';
