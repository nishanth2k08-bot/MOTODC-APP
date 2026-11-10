/**
 * Precision Google Maps Navigation Utility for MotoDC Partner App
 * Formats clean, deduplicated addresses and doorstep GPS coordinates
 * and launches turn-by-turn navigation via Google's official Cross-Platform URL API.
 */

export function buildCleanAddressString(shipping) {
  const rawAddress = (shipping?.address || '').trim();
  const rawCity = (shipping?.city || '').trim();
  const rawState = (shipping?.state || '').trim();
  const rawPincode = (shipping?.pincode || '').trim();

  // Combine components into one string to analyze tokens
  const combined = `${rawAddress}, ${rawCity}, ${rawState}, ${rawPincode}`;
  const rawTokens = combined
    .split(',')
    .map(t => t.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const seen = new Set();
  const cleanTokens = [];
  let pincodeVal = '';

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (lower === 'india') continue; // omit redundant country token

    // Check if token is a 6-digit Indian PIN code
    if (/^\d{6}$/.test(token)) {
      pincodeVal = token;
      continue;
    }

    if (!seen.has(lower)) {
      seen.add(lower);
      cleanTokens.push(token);
    }
  }

  // Ensure district/city (Karaikal) and State (Puducherry) are present
  const hasKaraikal = cleanTokens.some(t => /karaikal/i.test(t));
  const hasPuducherry = cleanTokens.some(t => /puducherry|pondicherry/i.test(t));

  if (!hasKaraikal) cleanTokens.push('Karaikal');
  if (!hasPuducherry) cleanTokens.push('Puducherry');

  // If a pincode exists from shipping or tokens, append cleanly
  const finalPin = pincodeVal || (rawPincode.match(/\b\d{6}\b/) ? rawPincode.match(/\b\d{6}\b/)[0] : '');
  if (finalPin && !cleanTokens.some(t => t.includes(finalPin))) {
    cleanTokens.push(finalPin);
  }

  return cleanTokens.join(', ') || 'Karaikal, Puducherry';
}

export function buildGoogleMapsUrl(shipping) {
  // 1. High-precision doorstep GPS coordinates (exact doorstep pin)
  if (shipping?.lat && shipping?.lng) {
    const lat = parseFloat(shipping.lat);
    const lng = parseFloat(shipping.lng);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    }
  }

  // 2. High-precision deduplicated address fallback
  const cleanAddress = buildCleanAddressString(shipping);
  const destination = encodeURIComponent(cleanAddress);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

export function openGoogleMapsNavigation(shipping) {
  const mapsUrl = buildGoogleMapsUrl(shipping);
  try {
    const a = document.createElement('a');
    a.href = mapsUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (_) {
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  }
}
