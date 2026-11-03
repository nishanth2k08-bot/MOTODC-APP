// Solution A: 4 Geographic Logistics Route Corridors for Karaikal District
export const CORRIDOR_METADATA = {
  central_town: {
    id: 'central_town',
    name: 'Central Town Corridor',
    code: 'CTC-01',
    color: '#10b981', // Emerald
    bgLight: 'rgba(16, 185, 129, 0.12)',
    badgeColor: '#059669',
    areas: 'Bus Stand, Beach Road, Market, Bharathiar St, Nehru St',
    pincodes: '609602',
    description: 'High-density commercial core and coastal residential boulevard',
  },
  north_corridor: {
    id: 'north_corridor',
    name: 'North Corridor',
    code: 'NRC-02',
    color: '#3b82f6', // Sapphire Blue
    bgLight: 'rgba(59, 130, 246, 0.12)',
    badgeColor: '#2563eb',
    areas: 'Kottucherry, Varichikudy, Nedungadu, Thiruvettakudy',
    pincodes: '609603, 609605',
    description: 'Northern coastal bypass and agrarian residential belt',
  },
  south_corridor: {
    id: 'south_corridor',
    name: 'South Corridor',
    code: 'SRC-03',
    color: '#8b5cf6', // Violet
    bgLight: 'rgba(139, 92, 246, 0.12)',
    badgeColor: '#7c3aed',
    areas: 'T.R. Pattinam, Neravy, Polagam, Karaikal Port Road',
    pincodes: '609606, 609604',
    description: 'Harbor industrial lane, maritime port bypass & industrial hub',
  },
  west_corridor: {
    id: 'west_corridor',
    name: 'West Corridor',
    code: 'WTC-04',
    color: '#f59e0b', // Amber
    bgLight: 'rgba(245, 158, 11, 0.12)',
    badgeColor: '#d97706',
    areas: 'Thirunallar Temple Route, Ambagarathur, Surakudy',
    pincodes: '609607, 609601',
    description: 'Pilgrim corridor, Saneeswara temple artery & peri-urban link',
  },
};

/**
 * Classifies any Karaikal delivery address into one of 4 geographic corridors.
 * Uses exact PIN codes first, followed by fuzzy area/landmark regex patterns.
 */
export function detectDeliveryZone(shipping = {}) {
  const addressText = `${shipping.address || ''} ${shipping.city || ''} ${shipping.state || ''} ${shipping.pincode || ''}`.toLowerCase();
  const pincode = String(shipping.pincode || '').trim();

  // 1. Exact Postal PIN Code Matching
  if (pincode === '609603' || pincode === '609609' || pincode === '609605') return 'north_corridor';
  if (pincode === '609606' || pincode === '609604') return 'south_corridor';
  if (pincode === '609607' || pincode === '609601') return 'west_corridor';
  if (pincode === '609602') return 'central_town';

  // 2. High-precision Arterial Keyword Matching
  // West (Thirunallar temple route / Ambagarathur / Surakudy)
  if (
    /thirunallar|tirunallar|saneeswar|ambagarathur|pettai|surakud|sorakud|nallambal|thenur|kollumangudi|subbarayapuram/.test(
      addressText
    )
  ) {
    return 'west_corridor';
  }

  // South (T.R. Pattinam / Neravy / Port road)
  if (
    /t\.?r\.?\s*pattinam|thirumalairayanpattinam|neravy|neravi|polagam|keezhaiyur|keelaiyur|vanjore|port\s*road|karaikal\s*port|nagore/.test(
      addressText
    )
  ) {
    return 'south_corridor';
  }

  // North (Kottucherry / Varichikudy / Nedungadu)
  if (
    /kottucherry|kotchery|varichikud|nedungadu|thiruvettakud|kurumbagaram|poovam|mandapathur|tarangambadi/.test(
      addressText
    )
  ) {
    return 'north_corridor';
  }

  // Central Town / Default Core
  return 'central_town';
}
