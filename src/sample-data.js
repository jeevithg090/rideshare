import { createPool, joinPool } from './pool.js';

/**
 * Demo pools for trying the join flow on a single device. Names are generic
 * and phone numbers use the reserved +91 90000 0000x range.
 * @param {number} [now]
 */
export function samplePools(now = Date.now()) {
  const morning = createPool(
    {
      host: { name: 'Asha', phone: '+919000000001' },
      pickup: 'Koramangala 5th Block',
      drop: 'Electronic City Phase 1',
      time: '08:30',
      fare: 600,
      partySize: 1,
    },
    { id: 'sample-morning', now },
  );

  const airport = joinPool(
    createPool(
      {
        host: { name: 'Ravi', phone: '+919000000002' },
        pickup: 'Indiranagar Metro Station',
        drop: 'Kempegowda International Airport',
        time: '06:15',
        fare: 1400,
        partySize: 1,
      },
      { id: 'sample-airport', now: now + 1 },
    ),
    { name: 'Meera', phone: '+919000000003', seats: 1 },
  );

  const evening = joinPool(
    createPool(
      {
        host: { name: 'Karthik', phone: '+919000000004' },
        pickup: 'Whitefield ITPL',
        drop: 'MG Road',
        time: '18:45',
        fare: 720,
        partySize: 2,
      },
      { id: 'sample-evening', now: now + 2 },
    ),
    { name: 'Neha', phone: '+919000000005', seats: 2 },
  );

  return [morning, airport, evening];
}
