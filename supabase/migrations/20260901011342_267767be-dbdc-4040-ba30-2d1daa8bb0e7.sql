ALTER TABLE public.portal_documents ADD COLUMN IF NOT EXISTS display_name text;

UPDATE public.portal_documents SET display_name = 'Seller Representation Agreement' WHERE id='d77f2d30-de43-4f32-aa7e-f9968515b58f';
UPDATE public.portal_documents SET display_name = 'RECO Information Guide' WHERE id='a024cbf0-1711-4dab-903e-ebc647b2c181';
UPDATE public.portal_documents SET display_name = 'Notice of Fulfilment - Inspection' WHERE id='599b153f-4c8f-4899-92ff-ff551ebf4fc5';
UPDATE public.portal_documents SET display_name = 'Conditionally Accepted Offer' WHERE id='ca8c4459-7c79-4a67-9560-a79a8317d2b0';
UPDATE public.portal_documents SET display_name = 'Listing Agreement (Draft - for your approval)' WHERE id='b4388e81-869b-4d2f-a15e-9277b04ff6eb';
UPDATE public.portal_documents SET display_name = 'Listing Agreement (Active)' WHERE id='25512856-6017-4645-ace3-9d94696a6d84';
UPDATE public.portal_documents SET display_name = 'Agreement of Purchase and Sale - 5 Elm' WHERE id='5678aa91-e723-4659-8832-fc8fe88e834b';

UPDATE public.portal_photos SET property_id='87658210-cb26-452c-8a69-2880056619ea' WHERE portal_id='8a183648-b990-490f-8de2-3b57f9cc182c';

DELETE FROM public.portal_transactions WHERE id='6262e9e7-ecd2-44dd-96bd-1f9580639c2a';
DELETE FROM public.portal_properties WHERE id='14bf11a1-0ab7-4656-ad8c-850bf1c2ab95';