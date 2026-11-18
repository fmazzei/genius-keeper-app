// node --import ./tests/alias.mjs tests/exportarPdf.test.mjs
import { calcularCortes, nombrePdf } from '../src/utils/exportarPdf.js';
let ok = 0, mal = 0;
const igual = (a, b, t) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { mal++; console.error('✗', t, JSON.stringify(a), JSON.stringify(b)); } };

// Nombre del archivo.
const n = nombrePdf('Cuentas por pagar');
igual(/^Lacteoca - Cuentas por pagar - \d{2}-\d{2}-\d{4}\.pdf$/.test(n), true, 'nombre simple');
igual(/^Lacteoca - Reporte de visita - Páramo Piedra Azul - 18-11-26 - /.test(nombrePdf('Reporte de visita', 'Páramo: Piedra Azul', '18/11/26')), true, 'quita : y cambia / por -');
igual(nombrePdf('Lacteoca', '', null, 'Estado de cuenta').startsWith('Lacteoca - Estado de cuenta - '), true, 'sin piezas vacías ni repetidas');

// Cortes: un informe corto es una página.
igual(calcularCortes({ alto: 800, altoPagina: 1000 }), [[0, 800]], 'una página');
// Corta en la última fila que cabe, no a la mitad.
igual(calcularCortes({ alto: 2500, altoPagina: 1000, candidatos: [300, 600, 950, 1020, 1500, 1900, 2400] }),
    [[0, 950], [950, 1900], [1900, 2500]], 'corte en filas');
// Sin filas donde cortar: corte a la altura de la página.
igual(calcularCortes({ alto: 2100, altoPagina: 1000 }), [[0, 1000], [1000, 2000], [2000, 2100]], 'corte duro');
// Salto de página pedido por el informe.
igual(calcularCortes({ alto: 1500, altoPagina: 1000, candidatos: [200, 900], saltos: [400] })[0], [0, 400], 'el salto manda');
// Un bloque «no partir» no se corta por dentro si cabe en una página.
igual(calcularCortes({ alto: 2000, altoPagina: 1000, candidatos: [500, 900, 1300], sinPartir: [[700, 1300]] })[0], [0, 500], 'no parte el bloque');

console.log(`${ok} en verde${mal ? `, ${mal} fallan` : ''}`);
process.exit(mal ? 1 : 0);
