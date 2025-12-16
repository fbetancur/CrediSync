import { db } from '$lib/db/local.js';
import { registrarPago } from '$lib/sync/pagos.js';

/**
 * Registrar un pago que se distribuye entre múltiples créditos
 * Arquitectura offline-first: Cada pago se registra por crédito
 */
export async function registrarPagoMultiCredito({ cliente_id, monto_total, distribucion }) {
	console.log('💰 [COBRO-MULTI] Iniciando pago múltiple:', {
		cliente_id,
		monto_total,
		num_creditos: distribucion.length
	});
	
	// Validaciones
	if (!cliente_id || !monto_total || !distribucion || distribucion.length === 0) {
		throw new Error('Datos de pago inválidos');
	}
	
	const totalDistribuido = distribucion.reduce((sum, d) => sum + d.monto_aplicar, 0);
	if (Math.abs(totalDistribuido - monto_total) > 0.01) {
		throw new Error('La distribución no coincide con el monto total');
	}
	
	// Registrar un pago por cada crédito
	const pagosRegistrados = [];
	
	for (const dist of distribucion) {
		if (dist.monto_aplicar <= 0) continue;
		
		try {
			console.log(`💰 [COBRO-MULTI] Registrando pago para crédito ${dist.credito_id}:`, dist.monto_aplicar);
			
			// Usar la función existente de registrarPago
			await registrarPago({
				cliente_id, // IMPORTANTE: Incluir cliente_id
				credito_id: dist.credito_id,
				monto: dist.monto_aplicar,
				fecha: new Date().toISOString().split('T')[0], // Campo correcto: 'fecha'
				metodo_pago: 'EFECTIVO',
				notas: `Pago múltiple - ${distribucion.length} crédito${distribucion.length !== 1 ? 's' : ''}`
			});
			
			pagosRegistrados.push({
				credito_id: dist.credito_id,
				monto: dist.monto_aplicar
			});
			
		} catch (error) {
			console.error(`❌ [COBRO-MULTI] Error en crédito ${dist.credito_id}:`, error);
			
			// Si falla un pago, intentar revertir los anteriores
			// (esto es complejo, por ahora solo logueamos)
			console.error('⚠️ [COBRO-MULTI] Pagos registrados antes del error:', pagosRegistrados);
			
			throw new Error(`Error al registrar pago en crédito ${dist.credito_numero}: ${error.message}`);
		}
	}
	
	console.log('✅ [COBRO-MULTI] Pago múltiple completado:', {
		pagos_registrados: pagosRegistrados.length,
		monto_total
	});
	
	return {
		success: true,
		pagos_registrados: pagosRegistrados.length,
		monto_total
	};
}

/**
 * Calcular resumen de créditos de un cliente
 * Optimizado para carga rápida en la lista
 * IMPORTANTE: Recalcula estados en tiempo real (offline-first)
 */
export async function calcularResumenCliente(cliente_id) {
	// Obtener créditos activos del cliente
	const creditos = await db.creditos
		.where('cliente_id')
		.equals(cliente_id)
		.and(c => c.estado === 'ACTIVO')
		.toArray();
	
	if (creditos.length === 0) {
		return {
			total_adeudado: 0,
			cuotas_atrasadas: 0,
			creditos_activos: 0,
			dias_atraso_max: 0,
			creditos: []
		};
	}
	
	const hoy = new Date().toISOString().split('T')[0];
	let totalAdeudado = 0;
	let cuotasAtrasadas = 0;
	let diasAtrasoMax = 0;
	const creditosResumen = [];
	
	// Importar funciones de cálculo
	const { calcularEstadoCuotas } = await import('$lib/utils/creditos.js');
	
	for (const credito of creditos) {
		// Obtener pagos del crédito
		const pagos = await db.pagos
			.where('credito_id')
			.equals(credito.id)
			.toArray();
		
		// 👇 CALCULAR estados de cuotas en tiempo real (no usar valores de IndexedDB)
		const cuotasCalculadas = calcularEstadoCuotas(credito, pagos);
		
		// Filtrar cuotas pendientes (no pagadas)
		const cuotasPendientes = cuotasCalculadas.filter(c => c.estado !== 'PAGADA');
		
		// Calcular cuotas a cobrar: atrasadas + la de hoy (si existe)
		const cuotasAtrasadasCredito = cuotasPendientes.filter(c => c.fecha_programada < hoy);
		const cuotasACobrar = cuotasPendientes.filter(c => c.fecha_programada <= hoy);
		
		// IMPORTANTE: El adeudado incluye cuotas atrasadas + cuota del día de hoy
		const adeudadoCredito = cuotasACobrar.reduce((sum, c) => sum + c.saldo_pendiente, 0);
		
		const diasAtrasoCredito = cuotasAtrasadasCredito.length > 0
			? Math.max(...cuotasAtrasadasCredito.map(c => c.dias_atraso || 0))
			: 0;
		
		totalAdeudado += adeudadoCredito;
		cuotasAtrasadas += cuotasAtrasadasCredito.length;
		diasAtrasoMax = Math.max(diasAtrasoMax, diasAtrasoCredito);
		
		// Obtener producto para mostrar tipo
		const producto = await db.productos_credito.get(credito.producto_id);
		
		creditosResumen.push({
			id: credito.id,
			numero: credito.id.substring(0, 8),
			tipo: producto?.frecuencia || credito.frecuencia,
			adeudado: adeudadoCredito,
			cuotas_atrasadas: cuotasAtrasadasCredito.length,
			cuotas_a_cobrar: cuotasACobrar.length, // Total a cobrar hoy (atrasadas + hoy)
			dias_atraso: diasAtrasoCredito,
			saldo_pendiente: credito.saldo_pendiente
		});
	}
	
	return {
		total_adeudado: totalAdeudado,
		cuotas_atrasadas: cuotasAtrasadas,
		creditos_activos: creditos.length,
		dias_atraso_max: diasAtrasoMax,
		creditos: creditosResumen
	};
}

/**
 * Determinar estado del cliente basado en su situación de pagos
 */
export function determinarEstadoCliente(resumen) {
	if (resumen.creditos_activos === 0) {
		return 'SIN_CREDITO';
	}
	
	if (resumen.dias_atraso_max > 0) {
		return 'MORA';
	}
	
	if (resumen.cuotas_atrasadas > 0) {
		return 'PROXIMO';
	}
	
	return 'AL_DIA';
}
