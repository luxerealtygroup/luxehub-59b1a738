export const SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'sphere', label: 'Sphere of Influence' },
  { value: 'open_house', label: 'Open House' },
  { value: 'sign_call', label: 'Sign Call' },
  { value: 'online_lead', label: 'Online Lead' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'zillow', label: 'Zillow' },
  { value: 'realtor_com', label: 'Realtor.com' },
  { value: 'past_client', label: 'Past Client' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'door_knock', label: 'Door Knock' },
  { value: 'expired_fsbo', label: 'Expired/FSBO' },
  { value: 'builder', label: 'Builder' },
  { value: 'relocation', label: 'Relocation' },
  { value: 'other', label: 'Other' },
] as const;

export type SourceValue = typeof SOURCE_OPTIONS[number]['value'];
