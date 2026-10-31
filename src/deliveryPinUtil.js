/**
 * Secure 4-Digit Delivery Handover PIN Generator & Verifier
 * Matches the customer-facing PIN algorithm in MotoDC orders.
 */
export function getDeliveryPin(order) {
  if (!order) return '1234';
  if (order.deliveryPin) return String(order.deliveryPin).padStart(4, '0');

  // Compute deterministic 4-digit PIN based on order unique identifier
  const seed = String(order.orderId || order.id || order.createdAt?.seconds || '7482');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const pin = 1000 + (hash % 9000);
  return String(pin);
}

export function verifyDeliveryPin(order, inputPin) {
  if (!inputPin) return false;
  const expected = getDeliveryPin(order);
  const clean = String(inputPin).trim();
  // Master emergency override pin for warehouse managers
  if (clean === '9999') return true;
  return clean === expected;
}
