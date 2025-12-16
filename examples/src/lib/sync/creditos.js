import { db, SYNC_PRIORITY } from '$lib/db/local.js';
import { supabase } from '$lib/supabase.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';
import { isSyncingCreditos, syncCounter } from '$lib/stores/sync.js';
import { calcularCamposCredito } from '$lib/utils/creditos.js';
import { validarCredito } from '$lib/utils/validaciones.js';

/**
 * Obtener créditos activos de un cliente (local-first)
 */
export async function getCreditosCliente(clienteId) {
	const currentUser = get(user);
	if (!currentUser) return [];

	const creditos = await db.creditos
		.where('cliente_id')
		.equals(clienteId)
		.and((c) => c.estado === 'ACTIVO')
		.toArray();

	return creditos;
}

/**
 * Actualizar campos calculados de un crédito
 * Esta función recalcula todos los campos derivados del crédito
 * basándose en sus cuotas y pagos actuales
 * 
 * @param {string} creditoId - ID del crédito a actualizar
 * @returns {Object} Campos calculados actualizados
 */
export async function actualizarCamposCalculadosCredito(creditoId) {
	console.log('📊 [CREDITO] Actualizando campos calculados para:', creditoId);

	// 1. Obtener crédito actual
	const credito = await db.creditos.get(creditoId);
	if (!credito) {
		throw new Error(`Crédito ${creditoId} no encontrado`);
	}

	// 2. Obtener cuotas del crédito
	const cuotas = await db.cuotas
		.where('credito_id')
		.equals(creditoId)
		.toArray();

	console.log(`📊 [CREDITO] ${cuotas.length} cuotas encontradas`);

	// 3. Obtener pagos del crédito
	const pagos = await db.pagos
		.where('credito_id')
		.equals(creditoId)
		.toArray();

	console.log(`📊 [CREDITO] ${pagos.length} pagos encontrados`);

	// 4. Calcular campos usando la función de utilidades
	const camposCalculados = calcularCamposCredito(credito, cuotas, pagos);

	console.log('📊 [CREDITO] Campos calculados:', camposCalculados);

	// 5. Validar antes de guardar
	const creditoActualizado = {
		...credito,
		...camposCalculados
	};
	validarCredito(creditoActualizado);

	// 6. Actualizar en IndexedDB
	await db.creditos.update(creditoId, {
		...camposCalculados,
		updated_at: new Date().toISOString(),
		synced: false
	});

	console.log('✅ [CREDITO] Campos actualizados en IndexedDB');

	// 7. Agregar a cola de sincronización
	// IMPORTANTE: Enviar el crédito completo, no solo los campos calculados
	await db.sync_queue.add({
		table: 'creditos',
		operation: 'update',
		data: {
			...credito, // Incluir TODOS los campos del crédito
			...camposCalculados, // Sobrescribir con campos calculados
			updated_at: new Date().toISOString()
		},
		timestamp: new Date().toISOString(),
		synced: false,
		retry_count: 0,
		next_retry: new Date().toISOString(),
		priority: SYNC_PRIORITY.NORMAL
	});

	console.log('✅ [CREDITO] Agregado a cola de sincronización');

	return camposCalculados;
}

/**
 * Obtener todos los créditos activos (local-first)
 */
export async function getCreditosActivos() {
	const currentUser = get(user);
	if (!currentUser) return [];

	const creditos = await db.creditos
		.where('tenant_id')
		.equals('00000000-0000-0000-0000-000000000001')
		.and((c) => c.estado === 'ACTIVO')
		.toArray();

	return creditos;
}

/**
 * Crear crédito (offline-first)
 */
export async function createCredito(creditoData) {
	const currentUser = get(user);
	if (!currentUser) throw new Error('No user logged in');

	const now = new Date().toISOString();
	const credito = {
		id: crypto.randomUUID(),
		...creditoData,
		tenant_id: '00000000-0000-0000-0000-000000000001',
		created_by: currentUser.id,
		created_at: now,
		// Inicializar campos calculados (arquitectura offline-first)
		saldo_pendiente: creditoData.total_a_pagar,
		cuotas_pagadas: 0,
		dias_atraso: 0,
		synced: false
	};

	console.log('💳 [CREDITO] Creando crédito:', credito.id);
	console.log('💳 [CREDITO] excluir_domingos en creditoData:', creditoData.excluir_domingos);
	console.log('💳 [CREDITO] excluir_domingos en credito:', credito.excluir_domingos);
	console.log('💳 [CREDITO] Crédito completo:', JSON.stringify(credito, null, 2));

	// Validar antes de guardar
	validarCredito(credito);

	// Guardar localmente
	await db.creditos.add(credito);
	console.log('✅ [CREDITO] Guardado en IndexedDB');

	// Generar cuotas localmente
	const { generarCuotasLocales } = await import('./cuotas.js');
	await generarCuotasLocales(credito);
	console.log('✅ [CREDITO] Cuotas generadas localmente');

	// Actualizar campos calculados del cliente (arquitectura offline-first)
	try {
		const { actualizarCamposCalculadosCliente } = await import('./clientes.js');
		console.log('🔄 [CREDITO] Actualizando campos calculados del cliente...');
		await actualizarCamposCalculadosCliente(credito.cliente_id);
		console.log('✅ [CREDITO] Cliente actualizado');
	} catch (errorCliente) {
		console.error('❌ [CREDITO] Error actualizando cliente:', errorCliente);
		// No lanzar error para no bloquear la creación del crédito
		// El cliente se puede actualizar manualmente después
	}

	// Agregar a cola de sincronización con prioridad ALTA (operación crítica)
	await db.sync_queue.add({
		table: 'creditos',
		operation: 'insert',
		data: credito,
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.HIGH
	});
	console.log('✅ [CREDITO] Agregado a cola de sincronización');

	// Sincronizar inmediatamente
	console.log('🔄 [CREDITO] Iniciando sincronización inmediata...');
	syncCreditosToSupabase();

	return credito;
}

/**
 * Actualizar estado del crédito (offline-first)
 */
export async function updateEstadoCredito(id, estado) {
	const now = new Date().toISOString();

	// Obtener el crédito completo
	const creditoExistente = await db.creditos.get(id);
	if (!creditoExistente) {
		throw new Error('Crédito no encontrado');
	}

	const updatedData = {
		estado,
		synced: false
	};

	// Actualizar localmente
	await db.creditos.update(id, updatedData);

	// Agregar a cola de sincronización
	await db.sync_queue.add({
		table: 'creditos',
		operation: 'update',
		data: {
			...creditoExistente,
			...updatedData,
			id
		},
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.NORMAL
	});

	// Sincronizar inmediatamente
	syncCreditosToSupabase();
}

/**
 * Sincronizar créditos con Supabase
 */
export async function syncCreditosToSupabase() {
	if (!navigator.onLine) {
		console.log('⚠️ [CREDITO-SYNC] Offline - sincronización pospuesta');
		return;
	}

	const currentUser = get(user);
	if (!currentUser) {
		console.log('⚠️ [CREDITO-SYNC] No hay usuario - cancelando');
		return;
	}

	if (get(isSyncingCreditos)) {
		console.log('⏳ [CREDITO-SYNC] Sincronización ya en progreso - esperando');
		return;
	}

	console.log('🔄 [CREDITO-SYNC] Iniciando sincronización de créditos...');
	isSyncingCreditos.set(true);

	const MAX_RETRIES = 5;
	const now = new Date().toISOString();

	try {
		// 1. Subir cambios locales a Supabase
		const pendingItems = await db.sync_queue
			.filter(
				(item) =>
					item.table === 'creditos' &&
					!item.synced &&
					item.next_retry <= now &&
					item.retry_count < MAX_RETRIES
			)
			.toArray();

		console.log(`📤 [CREDITO-SYNC] ${pendingItems.length} créditos pendientes de subir`);

		for (const item of pendingItems) {
			try {
				if (item.operation === 'insert' || item.operation === 'update') {
					// Preparar datos para Supabase
					const creditoData = {
						id: item.data.id,
						tenant_id: item.data.tenant_id,
						cliente_id: item.data.cliente_id,
						producto_id: item.data.producto_id,
						cobrador_id: item.data.cobrador_id,
						ruta_id: item.data.ruta_id,
						monto_original: item.data.monto_original,
						interes_porcentaje: item.data.interes_porcentaje,
						total_a_pagar: item.data.total_a_pagar,
						numero_cuotas: item.data.numero_cuotas,
						valor_cuota: item.data.valor_cuota,
						frecuencia: item.data.frecuencia,
						excluir_domingos: item.data.excluir_domingos || false,
						fecha_desembolso: item.data.fecha_desembolso,
						fecha_primera_cuota: item.data.fecha_primera_cuota,
						fecha_ultima_cuota: item.data.fecha_ultima_cuota,
						estado: item.data.estado,
						// Campos calculados (arquitectura offline-first)
						saldo_pendiente: item.data.saldo_pendiente || item.data.total_a_pagar,
						cuotas_pagadas: item.data.cuotas_pagadas || 0,
						dias_atraso: item.data.dias_atraso || 0
					};

					const { data: credito, error } = await supabase
						.from('creditos')
						.upsert(creditoData, { onConflict: 'id' })
						.select()
						.single();

					if (!error && credito) {
						await db.creditos.put({ ...credito, synced: true });
						await db.sync_queue.delete(item.id);
						console.log('✅ [CREDITO-SYNC] Crédito sincronizado a Supabase:', credito.id);
					} else if (error) {
						const retryCount = (item.retry_count || 0) + 1;
						const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 60000);
						const nextRetry = new Date(Date.now() + backoffMs).toISOString();

						await db.sync_queue.update(item.id, {
							retry_count: retryCount,
							next_retry: nextRetry,
							last_error: error.message
						});

						console.error(`Sync failed, retry ${retryCount}/${MAX_RETRIES}:`, error);
					}
				}
			} catch (error) {
				console.error('Error syncing item:', error);
			}
		}

		// 2. Descargar cambios de Supabase
		console.log('📥 [CREDITO-SYNC] Descargando créditos de Supabase...');
		const { data: remoteCreditos, error } = await supabase
			.from('creditos')
			.select('*')
			.eq('tenant_id', '00000000-0000-0000-0000-000000000001');

		if (error) {
			console.error('❌ [CREDITO-SYNC] Error descargando de Supabase:', error);
		} else if (remoteCreditos) {
			console.log(`📥 [CREDITO-SYNC] ${remoteCreditos.length} créditos en Supabase`);
			
			// Crear Set de IDs remotos para comparación rápida
			const remoteIds = new Set(remoteCreditos.map((c) => c.id));

			// Obtener todos los créditos locales
			const localCreditos = await db.creditos
				.where('tenant_id')
				.equals('00000000-0000-0000-0000-000000000001')
				.toArray();

			// 2.1. Eliminar créditos que ya no existen en Supabase
			for (const localCredito of localCreditos) {
				if (!remoteIds.has(localCredito.id)) {
					console.log('🗑️ [CREDITO-SYNC] Eliminando crédito que no existe en servidor:', localCredito.id);
					
					// Eliminar cuotas asociadas
					const cuotasEliminadas = await db.cuotas.where('credito_id').equals(localCredito.id).delete();
					console.log(`🗑️ [CREDITO-SYNC] ${cuotasEliminadas} cuotas eliminadas`);
					
					// Eliminar pagos asociados
					const pagosEliminados = await db.pagos.where('credito_id').equals(localCredito.id).delete();
					console.log(`🗑️ [CREDITO-SYNC] ${pagosEliminados} pagos eliminados`);
					
					// Eliminar crédito
					await db.creditos.delete(localCredito.id);
					
					// Actualizar campos calculados del cliente
					const { actualizarCamposCalculadosCliente } = await import('./clientes.js');
					await actualizarCamposCalculadosCliente(localCredito.cliente_id);
					console.log(`✅ [CREDITO-SYNC] Cliente ${localCredito.cliente_id} actualizado`);
				}
			}

			// 2.2. Agregar o actualizar créditos desde Supabase
			let nuevos = 0;
			let actualizados = 0;
			
			for (const remoteCredito of remoteCreditos) {
				try {
					const localCredito = await db.creditos.get(remoteCredito.id);

					if (!localCredito) {
						// NO existe local → Agregar SIEMPRE
						await db.creditos.add({
							...remoteCredito,
							synced: true
						});
						nuevos++;
						console.log(`✅ [CREDITO-SYNC] Crédito nuevo agregado: ${remoteCredito.id}`);
					} else {
						// Existe local → Actualizar solo si está sincronizado Y servidor es más reciente
						if (localCredito.synced) {
							const remoteDate = new Date(remoteCredito.created_at);
							const localDate = new Date(localCredito.created_at);

							if (remoteDate > localDate) {
								await db.creditos.put({
									...remoteCredito,
									synced: true
								});
								actualizados++;
								console.log(`✅ [CREDITO-SYNC] Crédito actualizado: ${remoteCredito.id}`);
							}
						}
						// Si localCredito.synced === false, mantener local (tiene cambios pendientes)
					}
				} catch (itemError) {
					console.error(`❌ [CREDITO-SYNC] Error procesando crédito ${remoteCredito.id}:`, itemError);
				}
			}
			
			console.log(`✅ [CREDITO-SYNC] Descarga completa: ${nuevos} nuevos, ${actualizados} actualizados`);
		}

		syncCounter.update((n) => n + 1);
		console.log('✅ [CREDITO-SYNC] Sincronización de créditos completada');
	} catch (error) {
		console.error('❌ [CREDITO-SYNC] Error en sincronización:', error);
		// NO mostrar notificación en cada error - el circuit breaker lo maneja
	} finally {
		isSyncingCreditos.set(false);
	}
}
