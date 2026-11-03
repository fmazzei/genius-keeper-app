// node tests/cuentasCorreo.test.mjs
// Liberar el correo de una cuenta que ya no se usa (3-nov-2026): Erick entra a
// ventas con ventas@lacteoca.com, que era de la cuenta de Wilmer (sin perfil).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { _internos: { decidirLiberacion, correoDeArchivo, esDeArchivo } } = require('../functions/handlers/cuentasCorreo.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cuenta = (uid, email) => ({ uid, email });

ok(decidirLiberacion({ email: 'nuevo@lacteoca.com', cuenta: null, perfil: null, callerUid: 'M' }).estado === 'libre',
    'un correo sin cuenta está libre');
ok(decidirLiberacion({ email: 'ventas@lacteoca.com', cuenta: cuenta('W', 'ventas@lacteoca.com'), perfil: null, callerUid: 'M' }).estado === 'liberable',
    'cuenta sin perfil en GK (Wilmer): se puede liberar');
ok(decidirLiberacion({ email: 'carolina@lacteoca.com', cuenta: cuenta('C', 'carolina@lacteoca.com'), perfil: { name: 'Carolina', role: 'vendedor', active: false }, callerUid: 'M' }).estado === 'liberable',
    'vendedora inactiva: se puede liberar');
const activa = decidirLiberacion({ email: 'carolina@lacteoca.com', cuenta: cuenta('C', 'x'), perfil: { name: 'Carolina', role: 'vendedor' }, callerUid: 'M' });
ok(activa.estado === 'bloqueado' && /Carolina/.test(activa.motivo) && /inactiva/.test(activa.motivo),
    'vendedora ACTIVA: no se libera y dice que hay que marcarla inactiva');
ok(decidirLiberacion({ email: 'Anaquel@Lacteoca.com', cuenta: cuenta('A', 'x'), perfil: null, callerUid: 'M' }).estado === 'bloqueado',
    'una cuenta compartida nunca se libera (sin importar mayúsculas)');
ok(decidirLiberacion({ email: 'otro@lacteoca.com', cuenta: cuenta('X', 'x'), perfil: { role: 'master', active: false }, callerUid: 'M' }).estado === 'bloqueado',
    'una cuenta de máster nunca se libera');
ok(decidirLiberacion({ email: 'yo@lacteoca.com', cuenta: cuenta('M', 'x'), perfil: null, callerUid: 'M' }).estado === 'bloqueado',
    'no se libera la propia cuenta');

const arch = correoDeArchivo('mFAMSyQiESSvGkrKVN7RutTGZNJ3', 'Ventas@Lacteoca.com', 1793700000000);
ok(arch.endsWith('@lacteoca.com') && arch.startsWith('baja.mfamsyqiessvgkrkvn7rutgznj3.'.slice(0, 10)), `correo de archivo en el mismo dominio (${arch})`);
ok(esDeArchivo(arch) && !esDeArchivo('ventas@lacteoca.com'), 'se reconoce un correo de archivo');
ok(correoDeArchivo('U', 'a@b.com', 1) !== correoDeArchivo('U', 'a@b.com', 2), 'dos liberaciones de la misma cuenta no chocan');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto'); process.exit(fallas ? 1 : 0);
