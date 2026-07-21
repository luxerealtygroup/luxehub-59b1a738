// Fabricated demo numbers used when Demo Mode is toggled on.
// Purpose: allow admins to take marketing screenshots without exposing real data.
// Values are intentionally polished and "on pace" to look aspirational.

import type { DealMetrics } from '@/hooks/useFubDealMetrics';

export const DEMO_STATS = {
  totalDeals: 42,
  activeDeals: 14,
  totalCommissions: 287500,
  pendingCommissions: 96200,
  activitiesThisWeek: 38,
  goalsProgress: 82,
  dealsGoal: 36,
  gciGoal: 350000,
  closedDeals: 28,
};

export const DEMO_MONTHLY_GCI = [
  { month: 'Jan', gci: 18500 },
  { month: 'Feb', gci: 22400 },
  { month: 'Mar', gci: 31200 },
  { month: 'Apr', gci: 27800 },
  { month: 'May', gci: 34600 },
  { month: 'Jun', gci: 29100 },
  { month: 'Jul', gci: 38900 },
  { month: 'Aug', gci: 42500 },
  { month: 'Sep', gci: 36700 },
  { month: 'Oct', gci: 5800 },
  { month: 'Nov', gci: 0 },
  { month: 'Dec', gci: 0 },
];

export const DEMO_FUB_METRICS: DealMetrics = {
  deals_closed: 28,
  deals_pending: 14,
  gci_earned: 287500,
  gci_pending: 96200,
  sales_volume_closed: 18400000,
  weighted_closed: 28,
  weighted_pending: 14,
  weighted_debug_closed: null,
  weighted_debug_pending: null,
  sales_count_closed: 26,
  lease_count_closed: 6,
  gci_sales_closed: 271200,
  gci_leases_closed: 16300,
  sales_count_pending: 11,
  lease_count_pending: 3,
  sales_count_conditional: 4,
  gci_sales_pending: 82100,
  gci_leases_pending: 6800,
  gci_sales_conditional: 41500,
};

// ─── Reports page demo overrides ─────────────────────────────────────────

export const DEMO_GOAL_SETTINGS = {
  deals_goal: 36,
  gci_goal: 350000,
  avg_sale_price: 720000,
  commission_rate: 2.5,
  split_percent: 85,
  fallout_rate: 30,
  monthlyDeals: [2, 2, 3, 3, 4, 3, 4, 4, 3, 3, 3, 2],
};

export const DEMO_PIPELINE_CLIENTS = [
  { id: 'demo-1', client_name: 'The Andersons', stage: 9, client_type: 'buyer' as const, projected_sale_amount: 850000, projected_gci: 21250, expected_pending_date: '2026-08-15', status: 'active', source: 'Referral' },
  { id: 'demo-2', client_name: 'Sophia Chen', stage: 8, client_type: 'seller' as const, projected_sale_amount: 1250000, projected_gci: 31250, expected_pending_date: '2026-09-10', status: 'active', source: 'Past Client' },
  { id: 'demo-3', client_name: 'M. Rodriguez', stage: 10, client_type: 'buyer' as const, projected_sale_amount: 675000, projected_gci: 16875, expected_pending_date: '2026-08-01', status: 'active', source: 'Referral' },
  { id: 'demo-4', client_name: 'The Patels', stage: 7, client_type: 'seller' as const, projected_sale_amount: 920000, projected_gci: 23000, expected_pending_date: '2026-10-05', status: 'active', source: 'Open House' },
  { id: 'demo-5', client_name: 'J. Thompson', stage: 6, client_type: 'buyer' as const, projected_sale_amount: 540000, projected_gci: 13500, expected_pending_date: '2026-11-20', status: 'active', source: 'Sphere' },
  { id: 'demo-6', client_name: 'K. & L. Byrne', stage: 8, client_type: 'buyer' as const, projected_sale_amount: 780000, projected_gci: 19500, expected_pending_date: '2026-09-25', status: 'active', source: 'Referral' },
  { id: 'demo-7', client_name: 'D. Wallace', stage: 5, client_type: 'seller' as const, projected_sale_amount: 1150000, projected_gci: 28750, expected_pending_date: '2026-12-10', status: 'active', source: 'Sphere' },
  { id: 'demo-8', client_name: 'The Nguyens', stage: 9, client_type: 'seller' as const, projected_sale_amount: 1425000, projected_gci: 35625, expected_pending_date: '2026-08-30', status: 'active', source: 'Past Client' },
];

export const DEMO_DEALS_WITH_SOURCE = [
  { id: 'd1', source: 'Referral', deal_value: 875000 },
  { id: 'd2', source: 'Referral', deal_value: 640000 },
  { id: 'd3', source: 'Past Client', deal_value: 1240000 },
  { id: 'd4', source: 'Sphere', deal_value: 520000 },
  { id: 'd5', source: 'Open House', deal_value: 780000 },
  { id: 'd6', source: 'Past Client', deal_value: 960000 },
  { id: 'd7', source: 'Referral', deal_value: 720000 },
  { id: 'd8', source: 'Sphere', deal_value: 610000 },
  { id: 'd9', source: 'Online Lead', deal_value: 495000 },
  { id: 'd10', source: 'Referral', deal_value: 1100000 },
];

const currentYear = new Date().getFullYear();

export const DEMO_FORECAST_DEALS = [
  { id: 'f1', client_name: 'The Andersons', stage: 'under_contract', deal_value: 850000, expected_close_date: `${currentYear}-08-15`, commission_amount: 18000, gross_commission: 21250 },
  { id: 'f2', client_name: 'Sophia Chen', stage: 'under_contract', deal_value: 1250000, expected_close_date: `${currentYear}-09-10`, commission_amount: 26500, gross_commission: 31250 },
  { id: 'f3', client_name: 'M. Rodriguez', stage: 'offer', deal_value: 675000, expected_close_date: `${currentYear}-08-01`, commission_amount: 14300, gross_commission: 16875 },
  { id: 'f4', client_name: 'The Nguyens', stage: 'under_contract', deal_value: 1425000, expected_close_date: `${currentYear}-08-30`, commission_amount: 30200, gross_commission: 35625 },
  { id: 'f5', client_name: 'Past Deal 1', stage: 'closed', deal_value: 780000, expected_close_date: `${currentYear}-05-12`, commission_amount: 16500, gross_commission: 19500 },
  { id: 'f6', client_name: 'Past Deal 2', stage: 'closed', deal_value: 920000, expected_close_date: `${currentYear}-06-22`, commission_amount: 19500, gross_commission: 23000 },
  { id: 'f7', client_name: 'Past Deal 3', stage: 'closed', deal_value: 640000, expected_close_date: `${currentYear}-03-18`, commission_amount: 13600, gross_commission: 16000 },
];

export const DEMO_WEEKLY_411 = {
  calls_goal: 50,
  calls_actual: 42,
  appointments_goal: 8,
  appointments_actual: 6,
  listings_goal: 3,
  listings_actual: 2,
  contracts_goal: 2,
  contracts_actual: 2,
  contacts_made: 38,
  dials: 62,
  doors_knocked: 25,
  appointments_set: 7,
  appointments_held: 6,
  pipeline_additions: 4,
  contracts_signed: 2,
  firm_deals: 1,
  database_size: 480,
  priority_1: 'Complete listing presentation for Chen property',
  priority_1_completed: true,
  priority_2: 'Follow up with 5 hot leads from open house',
  priority_2_completed: true,
  priority_3: 'Prep CMA for Wallace listing appointment',
  priority_3_completed: false,
  priority_4: 'Review buyer contracts with Andersons',
  priority_4_completed: true,
};

export const DEMO_TRANSACTIONS = [
  { id: 1001, clientName: 'The Andersons', propertyAddress: '124 Maple Ridge Dr, Oakville, ON', stageName: 'Sold', dealValue: 875000, grossCommission: 21875, createdAt: `${currentYear}-02-14`, status: 'Sold', source: 'fub', pipelineName: 'Buyer', name: 'Andersons - Maple Ridge', isLease: false, weight: 1 },
  { id: 1002, clientName: 'Sophia Chen', propertyAddress: '58 Lakeshore Blvd, Burlington, ON', stageName: 'Sold', dealValue: 1240000, grossCommission: 31000, createdAt: `${currentYear}-03-02`, status: 'Sold', source: 'fub', pipelineName: 'Seller', name: 'Chen - Lakeshore', isLease: false, weight: 1 },
  { id: 1003, clientName: 'M. Rodriguez', propertyAddress: '812 Oak Park Ave, Milton, ON', stageName: 'Sold', dealValue: 675000, grossCommission: 16875, createdAt: `${currentYear}-04-11`, status: 'Sold', source: 'fub', pipelineName: 'Buyer', name: 'Rodriguez - Oak Park', isLease: false, weight: 1 },
  { id: 1004, clientName: 'The Patels', propertyAddress: '204 Trafalgar Rd, Oakville, ON', stageName: 'Sold', dealValue: 920000, grossCommission: 23000, createdAt: `${currentYear}-05-19`, status: 'Sold', source: 'fub', pipelineName: 'Seller', name: 'Patels - Trafalgar', isLease: false, weight: 1 },
  { id: 1005, clientName: 'J. Thompson', propertyAddress: '77 Riverside Cres, Mississauga, ON', stageName: 'Sold', dealValue: 540000, grossCommission: 13500, createdAt: `${currentYear}-06-08`, status: 'Sold', source: 'fub', pipelineName: 'Buyer', name: 'Thompson - Riverside', isLease: false, weight: 1 },
  { id: 1006, clientName: 'K. & L. Byrne', propertyAddress: '19 Kerr St, Oakville, ON', stageName: 'Sold', dealValue: 780000, grossCommission: 19500, createdAt: `${currentYear}-07-15`, status: 'Sold', source: 'fub', pipelineName: 'Buyer', name: 'Byrne - Kerr', isLease: false, weight: 1 },
  { id: 1007, clientName: 'The Nguyens', propertyAddress: '331 Rebecca St, Oakville, ON', stageName: 'Under Contract', dealValue: 1425000, grossCommission: 35625, createdAt: `${currentYear}-08-05`, status: 'Under Contract', source: 'fub', pipelineName: 'Seller', name: 'Nguyens - Rebecca', isLease: false, weight: 1 },
  { id: 1008, clientName: 'D. Wallace', propertyAddress: '410 Speers Rd, Oakville, ON', stageName: 'Offer Accepted', dealValue: 1150000, grossCommission: 28750, createdAt: `${currentYear}-08-20`, status: 'Offer Accepted', source: 'fub', pipelineName: 'Seller', name: 'Wallace - Speers', isLease: false, weight: 1 },
  { id: 1009, clientName: 'A. Morrison', propertyAddress: '88 Dundas St W, Oakville, ON', stageName: 'Leased', dealValue: 3200, grossCommission: 3200, createdAt: `${currentYear}-06-28`, status: 'Leased', source: 'fub', pipelineName: 'Lease', name: 'Morrison - Dundas', isLease: true, weight: 0.33 },
  { id: 1010, clientName: 'R. Sinclair', propertyAddress: '55 Bronte Rd, Oakville, ON', stageName: 'Sold', dealValue: 815000, grossCommission: 20375, createdAt: `${currentYear}-01-30`, status: 'Sold', source: 'fub', pipelineName: 'Buyer', name: 'Sinclair - Bronte', isLease: false, weight: 1 },
];

export const DEMO_PIPELINE_FULL = [
  { id: 'p1', client_name: 'The Andersons', client_type: 'buyer' as const, stage: 8, source: 'Referral', phone: '905-555-0142', email: 'andersons@demo.com', notes: '', projected_sale_amount: 850000, projected_gci: 21250, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-08-15`, property_address: '124 Maple Ridge Dr', created_at: `${currentYear}-06-01` },
  { id: 'p2', client_name: 'Sophia Chen', client_type: 'seller' as const, stage: 9, source: 'Past Client', phone: '905-555-0187', email: 'chen@demo.com', notes: '', projected_sale_amount: 1250000, projected_gci: 31250, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-09-10`, property_address: '58 Lakeshore Blvd', created_at: `${currentYear}-06-12` },
  { id: 'p3', client_name: 'M. Rodriguez', client_type: 'buyer' as const, stage: 9, source: 'Referral', phone: '905-555-0209', email: 'rodriguez@demo.com', notes: '', projected_sale_amount: 675000, projected_gci: 16875, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-08-01`, property_address: '812 Oak Park Ave', created_at: `${currentYear}-05-22` },
  { id: 'p4', client_name: 'The Patels', client_type: 'seller' as const, stage: 7, source: 'Open House', phone: '905-555-0221', email: 'patels@demo.com', notes: '', projected_sale_amount: 920000, projected_gci: 23000, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-10-05`, property_address: '204 Trafalgar Rd', created_at: `${currentYear}-07-03` },
  { id: 'p5', client_name: 'J. Thompson', client_type: 'buyer' as const, stage: 6, source: 'Sphere', phone: '905-555-0244', email: 'thompson@demo.com', notes: '', projected_sale_amount: 540000, projected_gci: 13500, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-11-20`, property_address: '77 Riverside Cres', created_at: `${currentYear}-07-14` },
  { id: 'p6', client_name: 'K. & L. Byrne', client_type: 'buyer' as const, stage: 8, source: 'Referral', phone: '905-555-0268', email: 'byrne@demo.com', notes: '', projected_sale_amount: 780000, projected_gci: 19500, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-09-25`, property_address: '19 Kerr St', created_at: `${currentYear}-06-28` },
  { id: 'p7', client_name: 'D. Wallace', client_type: 'seller' as const, stage: 5, source: 'Sphere', phone: '905-555-0279', email: 'wallace@demo.com', notes: '', projected_sale_amount: 1150000, projected_gci: 28750, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-12-10`, property_address: '410 Speers Rd', created_at: `${currentYear}-07-20` },
  { id: 'p8', client_name: 'The Nguyens', client_type: 'seller' as const, stage: 9, source: 'Past Client', phone: '905-555-0290', email: 'nguyens@demo.com', notes: '', projected_sale_amount: 1425000, projected_gci: 35625, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-08-30`, property_address: '331 Rebecca St', created_at: `${currentYear}-05-15` },
  { id: 'p9', client_name: 'A. Morrison', client_type: 'tenant' as const, stage: 4, source: 'Online Lead', phone: '905-555-0311', email: 'morrison@demo.com', notes: '', projected_sale_amount: 3200, projected_gci: 3200, commission_percent: 100, split_percent: 85, expected_pending_date: `${currentYear}-08-05`, property_address: '88 Dundas St W', created_at: `${currentYear}-07-08` },
  { id: 'p10', client_name: 'R. Sinclair', client_type: 'buyer' as const, stage: 3, source: 'Referral', phone: '905-555-0325', email: 'sinclair@demo.com', notes: '', projected_sale_amount: 815000, projected_gci: 20375, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-10-22`, property_address: '55 Bronte Rd', created_at: `${currentYear}-07-25` },
  { id: 'p11', client_name: 'The Kellys', client_type: 'buyer' as const, stage: 2, source: 'Sphere', phone: '905-555-0339', email: 'kellys@demo.com', notes: '', projected_sale_amount: 620000, projected_gci: 15500, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-11-15`, property_address: 'TBD', created_at: `${currentYear}-08-01` },
  { id: 'p12', client_name: 'H. Okafor', client_type: 'seller' as const, stage: 4, source: 'Referral', phone: '905-555-0350', email: 'okafor@demo.com', notes: '', projected_sale_amount: 995000, projected_gci: 24875, commission_percent: 2.5, split_percent: 85, expected_pending_date: `${currentYear}-10-30`, property_address: '92 Cornwall Rd', created_at: `${currentYear}-08-04` },
];