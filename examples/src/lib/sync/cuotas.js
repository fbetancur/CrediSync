import { db, SYNC_PRIORITY } from '$lib/db/local.js';
import { supabase } from '$lib/supabase.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';
import { isSyncingCuotas, syncCounter } from '$lib/stores/sync.js';
import { distribuirPagoEntreCuotas } from '$lib/utils/creditos.js';
import { validarCuota } from '$lib/utils/validaciones.js';

/**
 * Obtener cuotas de un crédito (local-first)
 */
export async function getCuotasCredito(creditoId) {
	const cuotas = await db.cuotas.where('credito_id').equals(creditoId).toArray();
	return cuotas.sort((a, b) => a.numero - b.numero);
}

/**
 * Obtener cuotas del día (local-first)
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 */
export async function getCuotasDelDia(fecha) {
	const cuotas = await db.cuotas.where('fecha_programada').equals(fecha).toArray();
	return cuotas;
}

/**
 * Obtener cuotas vencidas (local-first)
 */
export async function getCuotasVencidas() {
	const hoy = new Date().toISOString().split('T')[0];
	const cuotas = await db.cuotas
		.filter((cuota) => cuota.estado !== 'PAGADA' && cuota.fecha_programada < hoy)
		.toArray();
	return cuotas;
}

/**
 * Obtener cuotas pendientes de un crédito (local-first)
 */
export async function getCuotasPendientes(creditoId) {
	const cuotas = await db.cuotas
		.where('credito_id')
		.equals(creditoId)
		.and((c) => c.estado !== 'PAGADA')
		.toArray();
	return cuotas.sort((a, b) => a.numero - b.numero);
}

/**
 * Calcular siguiente fecha de cuota según frecuencia
 * IMPORTANTE: Debe ser idéntica a calcularSiguienteFecha() en creditos.js
 */
function calcularSiguienteFechaCuota(fecha, frecuencia, excluirDomingos = false) {
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

/**
 * Generar cuotas localmente al otorgar crédito (offline-first)
 * Arquitectura offline-first: Genera cuotas con TODOS los campos calculados
 * IMPORTANTE: Usa calcularCuotasProgramadas() para garantizar consistencia con la proyección
 */
export async function generarCuotasLocales(credito) {
	const now = new Date().toISOString();
	
	console.log(`📋 [CUOTAS] Generando ${credito.numero_cuotas} cuotas para crédito ${credito.id}`);
	console.log(`📋 [CUOTAS] excluir_domingos: ${credito.excluir_domingos}`);
	console.log(`📋 [CUOTAS] fecha_primera_cuota: ${credito.fecha_primera_cuota}`);
	console.log(`📋 [CUOTAS] frecuencia: ${credito.frecuencia}`);

	// Usar la misma función que la proyección para garantizar consistencia
	const { calcularCuotasProgramadas } = await import('$lib/utils/creditos.js');
	const cuotasProgramadas = calcularCuotasProgramadas(credito);
	
	console.log(`📋 [CUOTAS] ${cuotasProgramadas.length} cuotas programadas calculadas`);
	if (cuotasProgramadas.length > 0) {
		console.log(`📋 [CUOTAS] Primera cuota: ${cuotasProgramadas[0].fecha_programada}`);
		if (cuotasProgramadas.length > 1) {
			console.log(`📋 [CUOTAS] Segunda cuota: ${cuotasProgramadas[1].fecha_programada}`);
		}
		if (cuotasProgramadas.length > 2) {
			console.log(`📋 [CUOTAS] Tercera cuota: ${cuotasProgramadas[2].fecha_programada}`);
		}
	}

	// Convertir cuotas programadas a cuotas con todos los campos de IndexedDB
	const cuotas = cuotasProgramadas.map((cuotaProgramada) => {
		const cuota = {
			id: crypto.randomUUID(),
			credito_id: credito.id,
			tenant_id: credito.tenant_id,
			numero: cuotaProgramada.numero,
			fecha_programada: cuotaProgramada.fecha_programada,
			monto_programado: cuotaProgramada.monto_programado,
			// Campos calculados (arquitectura offline-first)
			monto_pagado: 0,
			saldo_pendiente: cuotaProgramada.monto_programado,
			estado: 'PENDIENTE',
			dias_atraso: 0,
			created_at: now,
			updated_at: now,
			synced: false
		};

		validarCuota(cuota);
		return cuota;
	});

	await db.cuotas.bulkAdd(cuotas);
	console.log(`✅ [CUOTAS] ${cuotas.length} cuotas generadas y guardadas en IndexedDB`);

	for (const cuota of cuotas) {
		await db.sync_queue.add({
			table: 'cuotas',
			operation: 'insert',
			data: cuota,
			timestamp: now,
			synced: false,
			retry_count: 0,
			next_retry: now,
			priority: SYNC_PRIORITY.HIGH
		});
	}

	console.log(`✅ [CUOTAS] ${cuotas.length} cuotas agregadas a cola de sincronización`);
	return cuotas;
}

/**
 * Actualizar cuotas localmente después de registrar un pago (offline-first)
 * Arquitectura offline-first: Usa función centralizada de distribución de pagos
 */
export async function actualizarCuotasLocales(pago) {
	const cuotasPendientes = await getCuotasPendientes(pago.credito_id);
	const now = new Date().toISOString();

	console.log(`💰 [CUOTAS] Distribuyendo pago de ${pago.monto} entre ${cuotasPendientes.length} cuotas`);

	// Usar función centralizada de distribución (arquitectura offline-first)
	const cuotasActualizadas = distribuirPagoEntreCuotas(pago, cuotasPendientes);

	console.log(`✅ [CUOTAS] ${cuotasActualizadas.length} cuotas actualizadas por distribución`);

	// Validar y guardar cada cuota actualizada
	for (const cuotaActualizada of cuotasActualizadas) {
		validarCuota(cuotaActualizada);

		await db.cuotas.update(cuotaActualizada.id, {
			monto_pagado: cuotaActualizada.monto_pagado,
			saldo_pendiente: cuotaActualizada.saldo_pendiente,
			estado: cuotaActualizada.estado,
			dias_atraso: cuotaActualizada.dias_atraso,
			updated_at: cuotaActualizada.updated_at,
			synced: false
		});

		console.log(`✅ [CUOTAS] Cuota ${cuotaActualizada.numero}: estado ${cuotaActualizada.estado}`);

		await db.sync_queue.add({
			table: 'cuotas',
			operation: 'update',
			data: {
				id: cuotaActualizada.id,
				monto_pagado: cuotaActualizada.monto_pagado,
				saldo_pendiente: cuotaActualizada.saldo_pendiente,
				estado: cuotaActualizada.estado,
				dias_atraso: cuotaActualizada.dias_atraso,
				updated_at: cuotaActualizada.updated_at
			},
			timestamp: now,
			synced: false,
			retry_count: 0,
			next_retry: now,
			priority: SYNC_PRIORITY.HIGH
		});
	}

	console.log(`✅ [CUOTAS] Distribución completa y sincronizada`);
	return cuotasActualizadas;
}

/**
 * Sincronizar cuotas con Supabase
 */
export async function syncCuotasToSupabase() {
	if (!navigator.onLine) {
		console.log('⚠️ [CUOTAS-SYNC] Offline - sincronización pospuesta');
		return;
	}

	const currentUser = get(user);
	if (!currentUser) {
		console.log('⚠️ [CUOTAS-SYNC] No hay usuario - cancelando');
		return;
	}

	if (get(isSyncingCuotas)) {
		console.log('⏳ [CUOTAS-SYNC] Sincronización ya en progreso - esperando');
		return;
	}

	console.log('🔄 [CUOTAS-SYNC] Iniciando sincronización de cuotas...');
	isSyncingCuotas.set(true);

	const MAX_RETRIES = 5;
	const now = new Date().toISOString();

	try {
		const pendingItems = await db.sync_queue
			.filter(
				(item) =>
					item.table === 'cuotas' &&
					!item.synced &&
					item.next_retry <= now &&
					item.retry_count < MAX_RETRIES
			)
			.toArray();

		console.log(`📤 [CUOTAS-SYNC] ${pendingItems.length} cuotas pendientes de subir`);

		for (const item of pendingItems) {
			try {
				if (item.operation === 'insert') {
					const { error } = await supabase
						.from('cuotas')
						.insert({
							id: item.data.id,
							credito_id: item.data.credito_id,
							tenant_id: item.data.tenant_id,
							numero: item.data.numero,
							fecha_programada: item.data.fecha_programada,
							monto_programado: item.data.monto_programado,
							monto_pagado: item.data.monto_pagado || 0,
							saldo_pendiente: item.data.saldo_pendiente || item.data.monto_programado,
							estado: item.data.estado || 'PENDIENTE',
							dias_atraso: item.data.dias_atraso || 0
						});

					if (!error) {
						await db.cuotas.update(item.data.id, { synced: true });
						await db.sync_queue.delete(item.id);
						console.log('✅ [CUOTAS-SYNC] Cuota sincronizada:', item.data.id);
					} else if (error.code === '23505') {
						await db.cuotas.update(item.data.id, { synced: true });
						await db.sync_queue.delete(item.id);
						console.log('✅ [CUOTAS-SYNC] Cuota ya existe en servidor:', item.data.id);
					} else {
						const retryCount = (item.retry_count || 0) + 1;
						const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 60000);
						const nextRetry = new Date(Date.now() + backoffMs).toISOString();

						await db.sync_queue.update(item.id, {
							retry_count: retryCount,
							next_retry: nextRetry,
							last_error: error.message
						});

						console.error(`❌ [CUOTAS-SYNC] Sync failed, retry ${retryCount}/${MAX_RETRIES}:`, error);
					}
				} else if (item.operation === 'update') {
					console.log(`📤 [CUOTAS-SYNC] Intentando actualizar cuota ${item.data.id}`);
					console.log(`📤 [CUOTAS-SYNC] Datos: monto_pagado=${item.data.monto_pagado}, estado=${item.data.estado}, saldo=${item.data.saldo_pendiente}`);

					const { data: existingCuota } = await supabase
						.from('cuotas')
						.select('id')
						.eq('id', item.data.id)
						.maybeSingle();

					if (!existingCuota) {
						console.log('⚠️ [CUOTAS-SYNC] Cuota no existe en servidor, intentando INSERT...');
						// Obtener cuota completa de IndexedDB para hacer INSERT
						const cuotaCompleta = await db.cuotas.get(item.data.id);
						if (cuotaCompleta) {
							const { error: insertError } = await supabase
								.from('cuotas')
								.insert({
									id: cuotaCompleta.id,
									credito_id: cuotaCompleta.credito_id,
									tenant_id: cuotaCompleta.tenant_id,
									numero: cuotaCompleta.numero,
									fecha_programada: cuotaCompleta.fecha_programada,
									monto_programado: cuotaCompleta.monto_programado,
									monto_pagado: cuotaCompleta.monto_pagado || 0,
									saldo_pendiente: cuotaCompleta.saldo_pendiente || cuotaCompleta.monto_programado,
									estado: cuotaCompleta.estado || 'PENDIENTE',
									dias_atraso: cuotaCompleta.dias_atraso || 0
								});

							if (!insertError) {
								await db.cuotas.update(item.data.id, { synced: true });
								await db.sync_queue.delete(item.id);
								console.log('✅ [CUOTAS-SYNC] Cuota insertada en servidor:', item.data.id);
							} else {
								console.error('❌ [CUOTAS-SYNC] Error insertando cuota:', insertError);
								await db.sync_queue.delete(item.id);
							}
						} else {
							await db.sync_queue.delete(item.id);
							console.log('⚠️ [CUOTAS-SYNC] Cuota no encontrada localmente, eliminando de cola');
						}
						continue;
					}

					const { error } = await supabase
						.from('cuotas')
						.update({
							monto_pagado: item.data.monto_pagado,
							saldo_pendiente: item.data.saldo_pendiente,
							estado: item.data.estado,
							dias_atraso: item.data.dias_atraso,
							updated_at: item.data.updated_at
						})
						.eq('id', item.data.id);

					if (!error) {
						await db.cuotas.update(item.data.id, { synced: true });
						await db.sync_queue.delete(item.id);
						console.log(`✅ [CUOTAS-SYNC] Cuota actualizada en Supabase: ${item.data.id} (monto_pagado=${item.data.monto_pagado}, estado=${item.data.estado})`);
					} else {
						const retryCount = (item.retry_count || 0) + 1;
						const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 60000);
						const nextRetry = new Date(Date.now() + backoffMs).toISOString();

						await db.sync_queue.update(item.id, {
							retry_count: retryCount,
							next_retry: nextRetry,
							last_error: error.message
						});

						console.error(`❌ [CUOTAS-SYNC] Update failed, retry ${retryCount}/${MAX_RETRIES}:`, error);
					}
				}
			} catch (error) {
				console.error('❌ [CUOTAS-SYNC] Error syncing item:', error);
			}
		}

		console.log('📥 [CUOTAS-SYNC] Descargando cuotas de Supabase...');
		const { data: remoteCuotas, error } = await supabase
			.from('cuotas')
			.select('*')
			.eq('tenant_id', '00000000-0000-0000-0000-000000000001');

		if (error) {
			console.error('❌ [CUOTAS-SYNC] Error descargando de Supabase:', error);
		} else if (remoteCuotas) {
			console.log(`📥 [CUOTAS-SYNC] ${remoteCuotas.length} cuotas en Supabase`);

			const remoteIds = new Set(remoteCuotas.map((c) => c.id));
			const localCuotas = await db.cuotas
				.where('tenant_id')
				.equals('00000000-0000-0000-0000-000000000001')
				.toArray();

			for (const localCuota of localCuotas) {
				if (!remoteIds.has(localCuota.id)) {
					console.log('🗑️ [CUOTAS-SYNC] Eliminando cuota que no existe en servidor:', localCuota.id);
					await db.cuotas.delete(localCuota.id);
				}
			}

			let nuevas = 0;
			let actualizadas = 0;

			for (const remoteCuota of remoteCuotas) {
				try {
					const localCuota = await db.cuotas.get(remoteCuota.id);

					if (!localCuota) {
						await db.cuotas.add({ ...remoteCuota, synced: true });
						nuevas++;
					} else {
						// ✅ CRÍTICO: NO sobrescribir cuotas con cambios locales pendientes
						if (localCuota.synced) {
							const remoteDate = new Date(remoteCuota.updated_at);
							const localDate = new Date(localCuota.updated_at);

							if (remoteDate > localDate) {
								await db.cuotas.put({ ...remoteCuota, synced: true });
								actualizadas++;
							}
						} else {
							// Cuota tiene cambios locales pendientes, NO sobrescribir
							console.log(`⏸️ [CUOTAS-SYNC] Manteniendo cambios locales pendientes: cuota ${localCuota.numero} del crédito ${localCuota.credito_id}`);
						}
					}
				} catch (itemError) {
					console.error(`❌ [CUOTAS-SYNC] Error procesando cuota ${remoteCuota.id}:`, itemError);
				}
			}

			console.log(`✅ [CUOTAS-SYNC] Descarga completa: ${nuevas} nuevas, ${actualizadas} actualizadas`);
		}

		syncCounter.update((n) => n + 1);
		console.log('✅ [CUOTAS-SYNC] Sincronización de cuotas completada');
	} catch (error) {
		console.error('❌ [CUOTAS-SYNC] Error en sincronización:', error);
	} finally {
		isSyncingCuotas.set(false);
	}
}
