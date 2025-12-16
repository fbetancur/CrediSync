/**
 * Módulo de Validaciones - CrediSync360
 * Validar integridad de datos antes de guardar en IndexedDB o sincronizar
 * Parte de la arquitectura offline-first puro (sin triggers en servidor)
 */

/**
 * Validar campos calculados de un cliente
 * @throws {Error} Si alguna validación falla
 */
export function validarCliente(cliente) {
	if (cliente.creditos_activos < 0) {
		throw new Error('creditos_activos no puede ser negativo');
	}

	if (cliente.saldo_total < 0) {
		throw new Error('saldo_total no puede ser negativo');
	}

	if (cliente.dias_atraso_max < 0) {
		throw new Error('dias_atraso_max no puede ser negativo');
	}

	const estadosPermitidos = ['SIN_CREDITOS', 'AL_DIA', 'MORA'];
	if (cliente.estado && !estadosPermitidos.includes(cliente.estado)) {
		throw new Error(`estado debe ser uno de: ${estadosPermitidos.join(', ')}`);
	}

	const scoresPermitidos = ['CONFIABLE', 'REGULAR', 'RIESGOSO'];
	if (cliente.score && !scoresPermitidos.includes(cliente.score)) {
		throw new Error(`score debe ser uno de: ${scoresPermitidos.join(', ')}`);
	}

	// Validar campos requeridos
	if (!cliente.nombre || cliente.nombre.trim() === '') {
		throw new Error('nombre es requerido');
	}

	return true;
}

/**
 * Validar campos calculados de un crédito
 * @throws {Error} Si alguna validación falla
 */
export function validarCredito(credito) {
	if (credito.saldo_pendiente < 0) {
		throw new Error('saldo_pendiente no puede ser negativo');
	}

	if (credito.cuotas_pagadas < 0) {
		throw new Error('cuotas_pagadas no puede ser negativo');
	}

	if (credito.cuotas_pagadas > credito.numero_cuotas) {
		throw new Error(`cuotas_pagadas (${credito.cuotas_pagadas}) no puede exceder numero_cuotas (${credito.numero_cuotas})`);
	}

	if (credito.dias_atraso < 0) {
		throw new Error('dias_atraso no puede ser negativo');
	}

	// Validar campos requeridos
	if (!credito.cliente_id) {
		throw new Error('cliente_id es requerido');
	}

	if (!credito.monto_original || credito.monto_original <= 0) {
		throw new Error('monto_original debe ser mayor a 0');
	}

	if (!credito.numero_cuotas || credito.numero_cuotas <= 0) {
		throw new Error('numero_cuotas debe ser mayor a 0');
	}

	return true;
}

/**
 * Validar campos calculados de una cuota
 * @throws {Error} Si alguna validación falla
 */
export function validarCuota(cuota) {
	if (cuota.monto_pagado < 0) {
		throw new Error('monto_pagado no puede ser negativo');
	}

	if (cuota.monto_pagado > cuota.monto_programado) {
		throw new Error(`monto_pagado (${cuota.monto_pagado}) no puede exceder monto_programado (${cuota.monto_programado})`);
	}

	if (cuota.saldo_pendiente < 0) {
		throw new Error('saldo_pendiente no puede ser negativo');
	}

	const estadosPermitidos = ['PENDIENTE', 'PARCIAL', 'PAGADA'];
	if (cuota.estado && !estadosPermitidos.includes(cuota.estado)) {
		throw new Error(`estado debe ser uno de: ${estadosPermitidos.join(', ')}`);
	}

	if (cuota.dias_atraso < 0) {
		throw new Error('dias_atraso no puede ser negativo');
	}

	// Validar campos requeridos
	if (!cuota.credito_id) {
		throw new Error('credito_id es requerido');
	}

	if (!cuota.numero || cuota.numero <= 0) {
		throw new Error('numero debe ser mayor a 0');
	}

	if (!cuota.monto_programado || cuota.monto_programado <= 0) {
		throw new Error('monto_programado debe ser mayor a 0');
	}

	return true;
}

/**
 * Validar un pago antes de registrarlo
 * @throws {Error} Si alguna validación falla
 */
export function validarPago(pago) {
	if (!pago.monto || pago.monto <= 0) {
		throw new Error('monto debe ser mayor a 0');
	}

	if (!pago.credito_id) {
		throw new Error('credito_id es requerido');
	}

	if (!pago.cliente_id) {
		throw new Error('cliente_id es requerido');
	}

	if (!pago.fecha) {
		throw new Error('fecha es requerida');
	}

	return true;
}

/**
 * Validar distribución de un pago entre cuotas
 * @param {Object} pago - Pago original
 * @param {Array} cuotasActualizadas - Cuotas después de aplicar el pago
 * @param {Array} cuotasOriginales - Cuotas antes de aplicar el pago
 * @throws {Error} Si la distribución es inválida
 */
export function validarDistribucionPago(pago, cuotasActualizadas, cuotasOriginales) {
	// Calcular suma de montos aplicados
	let totalAplicado = 0;
	
	for (const cuotaActualizada of cuotasActualizadas) {
		const cuotaOriginal = cuotasOriginales.find(c => c.id === cuotaActualizada.id);
		if (!cuotaOriginal) {
			throw new Error(`Cuota ${cuotaActualizada.id} no encontrada en cuotas originales`);
		}

		const montoAplicado = parseFloat(cuotaActualizada.monto_pagado) - parseFloat(cuotaOriginal.monto_pagado || 0);
		
		if (montoAplicado < 0) {
			throw new Error(`Monto aplicado negativo en cuota ${cuotaActualizada.numero}`);
		}

		// Validar que no se exceda el monto programado
		if (parseFloat(cuotaActualizada.monto_pagado) > parseFloat(cuotaActualizada.monto_programado)) {
			throw new Error(`Monto pagado excede monto programado en cuota ${cuotaActualizada.numero}`);
		}

		totalAplicado += montoAplicado;
	}

	// Validar que la suma de montos aplicados = monto del pago (con tolerancia de 1 centavo)
	const diferencia = Math.abs(totalAplicado - parseFloat(pago.monto));
	if (diferencia > 0.01) {
		throw new Error(`Suma de montos aplicados (${totalAplicado.toFixed(2)}) no coincide con monto del pago (${pago.monto})`);
	}

	return true;
}
