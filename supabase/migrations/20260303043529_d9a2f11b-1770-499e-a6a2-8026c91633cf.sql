
-- Create CMA reports table
CREATE TABLE public.cma_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Subject Property
  property_address TEXT NOT NULL,
  city_area TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'detached',
  bedrooms INTEGER,
  bathrooms INTEGER,
  approx_sqft INTEGER,
  target_list_price NUMERIC,
  intended_list_date DATE,
  
  -- Client Purchase History
  purchase_price NUMERIC NOT NULL,
  purchase_date DATE NOT NULL,
  improvements_invested NUMERIC DEFAULT 0,
  
  -- CloudCMA PDF
  cma_pdf_path TEXT,
  cma_pdf_name TEXT,
  
  -- Market Stats
  stats_method TEXT DEFAULT 'manual', -- manual, pdf, paste
  stats_date_range TEXT,
  active_listings INTEGER,
  sold_listings INTEGER,
  median_sale_price NUMERIC,
  avg_days_on_market NUMERIC,
  sale_to_list_ratio NUMERIC,
  months_of_inventory NUMERIC,
  market_notes TEXT,
  stats_pdf_path TEXT,
  stats_pasted_text TEXT,
  
  -- AI Extracted Data
  extracted_comps JSONB DEFAULT '[]'::jsonb,
  
  -- AI Analysis Results
  analysis_status TEXT DEFAULT 'draft', -- draft, processing, completed, error
  cma_grade TEXT, -- A-F
  pricing_band_low NUMERIC,
  pricing_band_recommended NUMERIC,
  pricing_band_high NUMERIC,
  pricing_confidence TEXT,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  weak_comp_alerts JSONB DEFAULT '[]'::jsonb,
  adjustment_observations JSONB DEFAULT '[]'::jsonb,
  talking_points JSONB DEFAULT '[]'::jsonb,
  seller_objections JSONB DEFAULT '[]'::jsonb,
  strategy_recommendation TEXT,
  market_narrative TEXT,
  
  -- Equity Calculations
  equity_gain_low NUMERIC,
  equity_gain_high NUMERIC,
  
  -- Full AI response
  ai_raw_response JSONB
);

-- Enable RLS
ALTER TABLE public.cma_reports ENABLE ROW LEVEL SECURITY;

-- Agents see their own, admins see all
CREATE POLICY "Users can view own CMA reports"
ON public.cma_reports FOR SELECT
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own CMA reports"
ON public.cma_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own CMA reports"
ON public.cma_reports FOR UPDATE
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can delete own CMA reports"
ON public.cma_reports FOR DELETE
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

-- Storage bucket for CMA PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('cma-documents', 'cma-documents', false);

-- Storage policies
CREATE POLICY "Users can upload CMA docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'cma-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view CMA docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'cma-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin_or_owner(auth.uid())));

CREATE POLICY "Users can delete CMA docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'cma-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin_or_owner(auth.uid())));
