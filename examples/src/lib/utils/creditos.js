/**
 * Utilidades para cálculos de créditos en tiempo real
 * Siguiendo el modelo optimizado sin campos calculados
 */

/**
 * Calcular siguiente fecha según frecuencia
 */
function calcularSiguienteFecha(fecha, frecuencia, excluirDomingos = false) {
	const nuevaFecha = new Date(fecha);

	switch (frecuencia) {
		case 'DIARIO':
			nuevaFecha.setDate(nuevaFecha.getDate() + 1);
			// Si excluye domingos y cae en domingo (0), pasar al lunes
			if (excluirDomingos && nuevaFecha.getDay() === 0) {
				nuevaFecha.setDate(nuevaFecha.getDate() + 1);
			}
			break;
		case 'SEMANAL':
			nuevaFecha.setDate(nuevaFecha.getDate() + 7);
			// Si excluye domingos y cae en domingo (0), pasar al lunes
			if (excluirDomingos && nuevaFecha.getDay() === 0) {
				nuevaFecha.setDate(nuevaFecha.getDate() + 1);
			}
			break;
		case 'QUINCENAL':
			nuevaFecha.setDate(nuevaFecha.getDate() + 15);
			// Si excluye domingos y cae en domingo (0), pasar al lunes
			if (excluirDomingos && nuevaFecha.getDay() === 0) {
				nuevaFecha.setDate(nuevaFecha.getDate() + 1);
			}
			break;
		case 'MENSUAL':
			nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
			// Si excluye domingos y cae en domingo (0), pasar al lunes
			if (excluirDomingos && nuevaFecha.getDay() === 0) {
				nuevaFecha.setDate(nuevaFecha.getDate() + 1);
			}
			break;
	}

	return nuevaFecha;
}

// Cache para cuotas programadas (memoización)
const cuotasCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * Calcular cuotas programadas (virtuales) con memoización
 */
export function calcularCuotasProgramadas(credito) {
	// Crear key único para el cache basado en los datos que afectan el cálculo
	const cacheKey = `${credito.id}-${credito.numero_cuotas}-${credito.fecha_primera_cuota}-${credito.frecuencia}-${credito.excluir_domingos || false}`;
	
	// Si ya está en cache, retornar inmediatamente
	if (cuotasCache.has(cacheKey)) {
		return cuotasCache.get(cacheKey);
	}
	
	// Calcular cuotas
	const cuotas = [];
	// Usar mediodía para evitar problemas de zona horaria
	let fechaActual = new Date(credito.fecha_primera_cuota + 'T12:00:00');
	const excluirDomingos = credito.excluir_domingos || false;

	for (let i = 1; i <= credito.numero_cuotas; i++) {
		// Formatear fecha correctamente para evitar problemas de timezone
		const year = fechaActual.getFullYear();
		const month = String(fechaActual.getMonth() + 1).padStart(2, '0');
		const day = String(fechaActual.getDate()).padStart(2, '0');
		const fechaFormateada = `${year}-${month}-${day}`;
		
		cuotas.push({
			numero: i,
			fecha_programada: fechaFormateada,
			monto_programado: credito.valor_cuota
		});

		fechaActual = calcularSiguienteFecha(fechaActual, credito.frecuencia, excluirDomingos);
	}
	
	// Guardar en cache
	cuotasCache.set(cacheKey, cuotas);
	
	// Limpiar cache si crece demasiado (mantener solo los últimos 100)
	if (cuotasCache.size > MAX_CACHE_SIZE) {
		const firstKey = cuotasCache.keys().next().value;
		cuotasCache.delete(firstKey);
	}

	return cuotas;
}

/**
 * Limpiar cache de cuotas programadas (útil para testing o cuando se modifica un crédito)
 */
export function limpiarCacheCuotas(creditoId = null) {
	if (creditoId) {
		// Limpiar solo las entradas de un crédito específico
		for (const key of cuotasCache.keys()) {
			if (key.startsWith(creditoId)) {
				cuotasCache.delete(key);
			}
		}
	} else {
		// Limpiar todo el cache
		cuotasCache.clear();
	}
}

/**
 * Calcular saldo pendiente del crédito
 */
export function calcularSaldoPendiente(credito, pagos) {
	const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
	return parseFloat(credito.total_a_pagar) - totalPagado;
}

/**
 * Calcular número de cuotas pagadas
 */
export function calcularCuotasPagadas(credito, pagos) {
	const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
	return Math.floor(totalPagado / parseFloat(credito.valor_cuota));
}

/**
 * Calcular estado de cada cuota con pagos aplicados
 */
export function calcularEstadoCuotas(credito, pagos) {
	const cuotasProgramadas = calcularCuotasProgramadas(credito);
	let montoRestante = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
	const hoy = new Date();
	hoy.setHours(0, 0, 0, 0);

	return cuotasProgramadas.map((cuota) => {
		const montoPagar = Math.min(montoRestante, cuota.monto_programado);
		montoRestante -= montoPagar;

		const saldoPendiente = cuota.monto_programado - montoPagar;
		const estado = saldoPendiente === 0 ? 'PAGADA' : montoPagar > 0 ? 'PARCIAL' : 'PENDIENTE';

		const fechaCuota = new Date(cuota.fecha_programada);
		fechaCuota.setHours(0, 0, 0, 0);

		const diasAtraso =
			estado !== 'PAGADA' && fechaCuota < hoy
				? Math.floor((hoy - fechaCuota) / (1000 * 60 * 60 * 24))
				: 0;

		return {
			...cuota,
			monto_pagado: montoPagar,
			saldo_pendiente: saldoPendiente,
			estado,
			dias_atraso: diasAtraso
		};
	});
}

/**
 * Calcular días de atraso del crédito
 */
export function calcularDiasAtraso(credito, pagos) {
	const cuotas = calcularEstadoCuotas(credito, pagos);
	const cuotasVencidas = cuotas.filter((c) => c.dias_atraso > 0);
	return cuotasVencidas.length > 0 ? Math.max(...cuotasVencidas.map((c) => c.dias_atraso)) : 0;
}

/**
 * Calcular estado del crédito (AL_DIA o MORA)
 */
export function calcularEstadoCredito(credito, pagos) {
	const diasAtraso = calcularDiasAtraso(credito, pagos);
	return diasAtraso > 0 ? 'MORA' : 'AL_DIA';
}

/**
 * Calcular estado financiero de un cliente
 */
export function calcularEstadoFinanciero(creditos, pagosPorCredito) {
	if (!creditos.length) {
		return {
			totalCreditos: 0,
			saldoTotal: 0,
			estado: 'SIN_CREDITOS',
			diasAtraso: 0,
			score: 'REGULAR'
		};
	}

	let saldoTotal = 0;
	let maxDiasAtraso = 0;

	for (const credito of creditos) {
		const pagos = pagosPorCredito[credito.id] || [];
		const saldo = calcularSaldoPendiente(credito, pagos);
		const diasAtraso = calcularDiasAtraso(credito, pagos);

		saldoTotal += saldo;
		maxDiasAtraso = Math.max(maxDiasAtraso, diasAtraso);
	}

	const estado = maxDiasAtraso > 0 ? 'EN_MORA' : 'AL_DIA';
	const score = maxDiasAtraso === 0 ? 'CONFIABLE' : maxDiasAtraso <= 5 ? 'REGULAR' : 'RIESGOSO';

	return {
		totalCreditos: creditos.length,
		saldoTotal,
		estado,
		diasAtraso: maxDiasAtraso,
		score
	};
}

/**
 * Formatear moneda
 */
export function formatearMoneda(valor) {
	return new Intl.NumberFormat('es-MX', {
		style: 'currency',
		currency: 'MXN'
	}).format(valor);
}

/**
 * Formatear fecha con día de la semana
 */
export function formatearFecha(fecha) {
	return new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * ============================================================================
 * NUEVAS FUNCIONES PARA ARQUITECTURA OFFLINE-FIRST PURO
 * (Eliminar triggers del servidor - Fase 2)
 * ============================================================================
 */

/**
 * Calcular todos los campos derivados de un cliente
 * @param {Object} cliente - Cliente base
 * @param {Array} creditos - Créditos del cliente
 * @param {Object} pagosPorCredito - Pagos agrupados por crédito { creditoId: [pagos] }
 * @returns {Object} Campos calculados del cliente
 */
export function calcularCamposCliente(cliente, creditos, pagosPorCredito) {
	// Si no hay créditos, retornar valores iniciales
	if (!creditos || creditos.length === 0) {
		return {
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};
	}

	// Filtrar solo créditos activos
	const creditosActivos = creditos.filter(c => c.estado === 'ACTIVO');

	if (creditosActivos.length === 0) {
		return {
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};
	}

	// Calcular saldo total y días de atraso máximo
	let saldoTotal = 0;
	let maxDiasAtraso = 0;

	for (const credito of creditosActivos) {
		const pagos = pagosPorCredito[credito.id] || [];
		const saldo = calcularSaldoPendiente(credito, pagos);
		const diasAtraso = calcularDiasAtraso(credito, pagos);

		saldoTotal += saldo;
		maxDiasAtraso = Math.max(maxDiasAtraso, diasAtraso);
	}

	// Calcular estado
	const estado = maxDiasAtraso > 0 ? 'MORA' : 'AL_DIA';

	// Calcular score basado en historial
	let score;
	if (maxDiasAtraso === 0) {
		score = 'CONFIABLE';
	} else if (maxDiasAtraso <= 5) {
		score = 'REGULAR';
	} else {
		score = 'RIESGOSO';
	}

	return {
		creditos_activos: creditosActivos.length,
		saldo_total: Math.max(0, saldoTotal), // Nunca negativo
		dias_atraso_max: Math.max(0, maxDiasAtraso), // Nunca negativo
		estado,
		score
	};
}

/**
 * Calcular todos los campos derivados de un crédito
 * @param {Object} credito - Crédito base
 * @param {Array} cuotas - Cuotas del crédito
 * @param {Array} pagos - Pagos del crédito
 * @returns {Object} Campos calculados del crédito
 */
export function calcularCamposCredito(credito, cuotas, pagos) {
	// Calcular saldo pendiente
	const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto), 0);
	const saldoPendiente = Math.max(0, parseFloat(credito.total_a_pagar) - totalPagado);

	// Calcular cuotas pagadas
	const cuotasPagadas = cuotas.filter(c => c.estado === 'PAGADA').length;

	// Calcular días de atraso (máximo de todas las cuotas vencidas)
	const hoy = new Date();
	hoy.setHours(0, 0, 0, 0);

	let maxDiasAtraso = 0;
	for (const cuota of cuotas) {
		if (cuota.estado !== 'PAGADA') {
			const fechaCuota = new Date(cuota.fecha_programada);
			fechaCuota.setHours(0, 0, 0, 0);

			if (fechaCuota < hoy) {
				const diasAtraso = Math.floor((hoy - fechaCuota) / (1000 * 60 * 60 * 24));
				maxDiasAtraso = Math.max(maxDiasAtraso, diasAtraso);
			}
		}
	}

	return {
		saldo_pendiente: Math.max(0, saldoPendiente), // Nunca negativo
		cuotas_pagadas: Math.max(0, cuotasPagadas), // Nunca negativo
		dias_atraso: Math.max(0, maxDiasAtraso) // Nunca negativo
	};
}

/**
 * Distribuir un pago entre las cuotas pendientes de un crédito
 * @param {Object} pago - Pago a distribuir
 * @param {Array} cuotasPendientes - Cuotas pendientes ordenadas por número
 * @returns {Array} Cuotas actualizadas con el pago aplicado
 */
export function distribuirPagoEntreCuotas(pago, cuotasPendientes) {
	const cuotasActualizadas = [];
	let montoRestante = parseFloat(pago.monto);
	const hoy = new Date();
	hoy.setHours(0, 0, 0, 0);

	// Validar que el monto sea positivo
	if (montoRestante <= 0) {
		throw new Error('El monto del pago debe ser mayor a 0');
	}

	// Validar que hay cuotas pendientes
	if (!cuotasPendientes || cuotasPendientes.length === 0) {
		throw new Error('No hay cuotas pendientes para aplicar el pago');
	}

	// Distribuir el pago entre las cuotas pendientes
	for (const cuota of cuotasPendientes) {
		if (montoRestante <= 0.01) break; // Tolerancia de 1 centavo

		// Calcular saldo pendiente de la cuota
		const montoProgramado = parseFloat(cuota.monto_programado) || 0;
		const montoPagadoAnterior = parseFloat(cuota.monto_pagado) || 0;
		const saldoPendiente = montoProgramado - montoPagadoAnterior;

		// Si la cuota ya está pagada, saltar
		if (saldoPendiente <= 0.01) {
			continue;
		}

		// Calcular cuánto aplicar a esta cuota
		const montoAplicar = Math.min(montoRestante, saldoPendiente);

		// Calcular nuevos valores
		const nuevoMontoPagado = parseFloat(cuota.monto_pagado || 0) + montoAplicar;
		const nuevoSaldo = parseFloat(cuota.monto_programado) - nuevoMontoPagado;

		// Validar que no se exceda el monto programado
		if (nuevoMontoPagado > parseFloat(cuota.monto_programado)) {
			throw new Error(`El monto pagado (${nuevoMontoPagado}) excede el monto programado (${cuota.monto_programado}) de la cuota ${cuota.numero}`);
		}

		// Determinar nuevo estado
		let nuevoEstado;
		if (nuevoSaldo <= 0.01) { // Tolerancia de 1 centavo
			nuevoEstado = 'PAGADA';
		} else if (nuevoMontoPagado > 0) {
			nuevoEstado = 'PARCIAL';
		} else {
			nuevoEstado = 'PENDIENTE';
		}

		// Calcular días de atraso
		const fechaCuota = new Date(cuota.fecha_programada);
		fechaCuota.setHours(0, 0, 0, 0);
		const diasAtraso = nuevoEstado !== 'PAGADA' && fechaCuota < hoy
			? Math.floor((hoy - fechaCuota) / (1000 * 60 * 60 * 24))
			: 0;

		// Agregar cuota actualizada
		cuotasActualizadas.push({
			...cuota,
			monto_pagado: nuevoMontoPagado,
			saldo_pendiente: Math.max(0, nuevoSaldo), // Nunca negativo
			estado: nuevoEstado,
			dias_atraso: Math.max(0, diasAtraso), // Nunca negativo
			updated_at: new Date().toISOString()
		});

		montoRestante -= montoAplicar;
	}

	// Validar que se actualizó al menos una cuota
	if (cuotasActualizadas.length === 0) {
		throw new Error('No se pudo aplicar el pago a ninguna cuota');
	}

	// Calcular total aplicado
	const totalAplicado = cuotasActualizadas.reduce((sum, cuotaActualizada) => {
		const cuotaOriginal = cuotasPendientes.find(cp => cp.id === cuotaActualizada.id);
		const montoPagadoAnterior = parseFloat(cuotaOriginal?.monto_pagado) || 0;
		const montoPagadoNuevo = parseFloat(cuotaActualizada.monto_pagado) || 0;
		const montoAplicado = montoPagadoNuevo - montoPagadoAnterior;
		return sum + montoAplicado;
	}, 0);

	// Validar que la suma de montos aplicados = monto del pago (con tolerancia)
	const diferencia = Math.abs(totalAplicado - parseFloat(pago.monto));
	if (diferencia > 0.01) {
		throw new Error(`Error en distribución: suma de montos aplicados (${totalAplicado.toFixed(2)}) no coincide con monto del pago (${pago.monto})`);
	}

	return cuotasActualizadas;
}
