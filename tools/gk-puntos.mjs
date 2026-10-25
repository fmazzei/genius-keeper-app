// Lee de GK (Firestore) los puntos de venta activos de retail y escribe data/puntos.json.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
initializeApp({ credential: applicationDefault(), projectId: process.env.PROYECTO || 'geniuskeeper-36553' });
const snap = await getFirestore().collection('pos').where('active', '==', true).get();
const puntos = [];
snap.forEach(d => {
  const x = d.data();
  if (x.eliminado === true) return;
  if ((x.canal || '').toLowerCase() === 'foodservice') return;
  puntos.push({ id: d.id, name: x.name || '', chain: x.chain || '', zone: x.zone || '', address: x.address || '' });
});
if (puntos.length < 5) { console.error('Muy pocos puntos leídos de GK (' + puntos.length + '); se conserva la lista anterior.'); process.exit(0); }
writeFileSync(new URL('../data/puntos.json', import.meta.url), JSON.stringify(puntos, null, 1));
console.log('::notice title=Puntos de venta leídos de GK::' + puntos.length);
