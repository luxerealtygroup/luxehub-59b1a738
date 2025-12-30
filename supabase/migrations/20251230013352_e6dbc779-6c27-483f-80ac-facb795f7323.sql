-- Create submissions table for all form types
CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_type TEXT NOT NULL, -- 'open_house', 'invoice', 'listing', 'buyer'
  user_id UUID NOT NULL,
  agent_name TEXT,
  submission_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Common fields
  client_name TEXT,
  property_address TEXT,
  notes TEXT,
  
  -- Open House specific
  open_house_date DATE,
  open_house_time TEXT,
  
  -- Invoice specific
  vendor_type TEXT,
  vendor_name TEXT,
  invoice_amount NUMERIC,
  invoice_date DATE,
  invoice_file_path TEXT,
  
  -- Listing specific
  seller_names TEXT,
  seller_emails TEXT,
  seller_phones TEXT,
  list_price NUMERIC,
  listing_date DATE,
  photography_package TEXT,
  staging_consult BOOLEAN DEFAULT false,
  occupancy TEXT,
  door_knockers BOOLEAN DEFAULT false,
  feature_sheets BOOLEAN DEFAULT false,
  listing_notes TEXT,
  
  -- Buyer specific
  buyer_names TEXT,
  buyer_emails TEXT,
  buyer_phones TEXT,
  lender_name_contact TEXT,
  purchase_price NUMERIC,
  closing_date DATE,
  client_occupation TEXT
);

-- Enable RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view submissions"
ON public.submissions
FOR SELECT
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert their own submissions"
ON public.submissions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own submissions"
ON public.submissions
FOR UPDATE
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can delete their own submissions"
ON public.submissions
FOR DELETE
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_submissions_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();