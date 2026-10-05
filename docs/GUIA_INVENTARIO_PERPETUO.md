# Inventario valorado: guía corta

Kroma → Administración → **Inventario valorado**. Lo ven administración, gerencia y el máster. La apertura y los conteos los registran el máster o gerencia.

## Qué es

Kroma lleva un libro con cada entrada y salida de queso terminado, valorada a su costo. El libro cubre tres lugares:

- la cava de la planta;
- lo que va en el camión a Caracas;
- Frimaca.

El libro lo escribe el sistema solo, cada vez que alguien registra algo: una producción, un despacho, una venta, un picking, una merma o un ajuste. Nadie lo puede editar ni borrar desde la app. Si hay que corregir algo, la corrección queda como un movimiento nuevo.

Cuándo sale el queso del inventario:

- **Venta en planta, despacho a otra ciudad, muestra, merma o reposición:** al registrarla.
- **Despacho a Caracas:** no es una salida. El queso sigue siendo de Lacteoca y pasa al camión.
- **Frimaca:** sale con el **picking**.
- **Lo que no llegó al recibir en Frimaca:** queda como merma.

## 1. Cargar el conteo inicial (una sola vez)

1. Cuenta el queso que hay en la cava y en Frimaca ese día.
2. Abre **Inventario valorado**. Mientras no esté abierto, la pantalla muestra la **apertura**: todas las partidas con existencia, separadas en Planta, En camino a Caracas y Frimaca.
3. En cada partida, corrige **Contado** si no coincide con lo que dice el sistema.
4. Revisa el **Costo**. Junto a cada costo dice de dónde salió:
   - *De su producción:* es el costo que se guardó al producirla.
   - *Calculado desde su producción:* se calculó con la leche, los insumos y el empaque del lote.
   - *Ingresado a mano:* la partida no tiene una producción registrada y hay que escribir el costo. Queda marcado así.
5. Cuando ninguna partida diga "Falta el costo", pulsa **Abrir el inventario perpetuo**. Desde ese momento cada movimiento queda en el libro.

## 2. Leer el reporte diario

En la pestaña **Hoy** está el valor a costo y a precio de planta de cada lugar, y la lista de controles. Cada control dice **Aprobado**, **Con diferencia** o **No aplica**. Al tocarlo se ven las cifras.

1. **Identidad por producto:** lo que había, más lo que entró, menos lo que salió, debe dar lo que hay.
2. **Cuadre contra lotes:** el libro debe coincidir con lo que muestra cada partida. Si alguien cambió una partida sin pasar por la app, aparece aquí.
3. **Costo de cada lote:** marca los lotes del día con algo fuera de lo normal. Puede ser un rendimiento o un costo que se aleja más de 15 % del promedio de los últimos 30 días, un lote sin costo de leche o de insumos, o litros que no cuadran con las recepciones. No bloquea nada; es una lista para revisar.
4. **Movimientos a revisar:** stock negativo y movimientos sin tipo, sin costo o sin lote.
5. **Conteo físico:** las diferencias del conteo del día.
6. **Zoho:** todavía no aplica.

En la pestaña **Reporte diario** se elige cualquier fecha pasada. Si se corrige un día anterior, ese reporte y los siguientes se recalculan solos esa noche. Para no esperar, pulsa **Recalcular**.

## 3. Registrar un conteo físico

1. Pestaña **Conteo físico**. Elige Planta o Frimaca.
2. Escribe lo contado **solo** en las partidas que no coinciden con el sistema.
3. Escribe el motivo, por ejemplo "conteo mensual de octubre".
4. Pulsa **Registrar conteo**. Cada diferencia queda en el libro como ajuste, valorada al costo de su lote, y sale en el control 5 del reporte.

## 4. Si un control sale "Con diferencia"

- **Movimiento sin tipo:** alguien cambió una partida por una vía que no dice qué fue. Busca el movimiento en **Libro valorado** y avisa al administrador.
- **Sin costo:** suele ser una planilla de papel cargada después de abrir. Asígnale costo en Gerencia → Financiero → "costo estimado". El sistema lo registra como revaluación.
- **Cuadre contra lotes:** la partida se cambió por fuera de la app. Hace falta un conteo físico de esa partida para dejar el libro igual a lo real.

El estado "error" con el mensaje de Zoho llega en la etapa 2, cuando el sistema empiece a enviar el asiento diario a Zoho Books.
