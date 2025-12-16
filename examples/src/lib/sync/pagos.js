import { db, SYNC_PRIORITY } from '$lib/db/local.js';
import { supabase } from '$lib/supabase.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';
import { isSyncingPagos, syncCounter } from '$lib/stores/sync.js';
import { showNotification } from '$lib/stores/notifications.js';

/**
 * Obtener pagos de un crédito (local-first)
 */
export async function getPagosCredito(creditoId) {
	const pagos = await db.pagos
		.where('credito_id')
		.equals(creditoId)
		.toArray();

	// Ordenar por fecha descendente
	return pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/**
 * Obtener pagos de un cliente (local-first)
 */
export async function getPagosCliente(clienteId) {
	const pagos = await db.pagos
		.where('cliente_id')
		.equals(clienteId)
		.toArray();

	return pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/**
 * Registrar pago (offline-first)
 * IMPORTANTE: Los pagos son INMUTABLES (solo INSERT, no UPDATE/DELETE)
 */
export async function registrarPago(pagoData) {
	const currentUser = get(user);
	if (!currentUser) throw new Error('No user logged in');

	const now = new Date().toISOString();
	const pago = {
		id: crypto.randomUUID(),
		...pagoData,
		cobrador_id: currentUser.id,
		tenant_id: '00000000-0000-0000-0000-000000000001',
		created_by: currentUser.id,
		created_at: now,
		synced: false
	};

	console.log('💰 [PAGO] Registrando pago:', pago.id);

	// Validar antes de guardar
	const { validarPago } = await import('$lib/utils/validaciones.js');
	validarPago(pago);

	// 1. Guardar pago
	await db.pagos.add(pago);
	console.log('✅ [PAGO] Guardado en IndexedDB');

	// 2. Actualizar cuotas localmente (arquitectura offline-first)
	const { actualizarCuotasLocales } = await import('./cuotas.js');
	await actualizarCuotasLocales(pago);
	console.log('✅ [PAGO] Cuotas actualizadas');

	// 3. Actualizar campos calculados del crédito (arquitectura offline-first)
	const { actualizarCamposCalculadosCredito } = await import('./creditos.js');
	await actualizarCamposCalculadosCredito(pago.credito_id);
	console.log('✅ [PAGO] Crédito actualizado');

	// 4. Actualizar campos calculados del cliente (arquitectura offline-first)
	try {
		const { actualizarCamposCalculadosCliente } = await import('./clientes.js');
		console.log('🔄 [PAGO] Actualizando campos calculados del cliente...');
		await actualizarCamposCalculadosCliente(pago.cliente_id);
		console.log('✅ [PAGO] Cliente actualizado');
	} catch (errorCliente) {
		console.error('❌ [PAGO] Error actualizando cliente:', errorCliente);
		// No lanzar error para no bloquear el registro del pago
		// El cliente se puede actualizar manualmente después
	}

	// Agregar a cola de sincronización con prioridad ALTA (operación crítica)
	await db.sync_queue.add({
		table: 'pagos',
		operation: 'insert',
		data: pago,
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.HIGH
	});
	console.log('✅ [PAGO] Agregado a cola de sincronización');

	// Sincronizar inmediatamente
	console.log('🔄 [PAGO] Iniciando sincronización inmediata...');
	syncPagosToSupabase();

	// Incrementar contador de sincronización para disparar recarga en UI
	syncCounter.update(n => n + 1);
	console.log('✅ [PAGO] Contador de sincronización incrementado');

	// Mostrar notificación de éxito
	showNotification({
		type: 'success',
		message: `Pago de ${pago.monto.toFixed(2)} registrado`,
		duration: 3000
	});

	return pago;
}

/**
 * Sincronizar pagos con Supabase
 */
export async function syncPagosToSupabase() {
	if (!navigator.onLine) {
		console.log('Offline - sync postponed');
		return;
	}

	const currentUser = get(user);
	if (!currentUser) return;

	if (get(isSyncingPagos)) {
		console.log('Pagos sync already in progress');
		return;
	}

	isSyncingPagos.set(true);

	const MAX_RETRIES = 5;
	const now = new Date().toISOString();

	try {
		// 1. Subir cambios locales a Supabase (solo INSERT)
		const pendingItems = await db.sync_queue
			.filter(
				(item) =>
					item.table === 'pagos' &&
					!item.synced &&
					item.next_retry <= now &&
					item.retry_count < MAX_RETRIES
			)
			.toArray();

		console.log('Pending pagos to sync:', pendingItems.length);

		for (const item of pendingItems) {
			try {
				// Los pagos son INMUTABLES, solo INSERT
				if (item.operation === 'insert') {
					// Validar que tenga cobrador_id (agregar si falta)
					if (!item.data.cobrador_id) {
						console.warn('Pago sin cobrador_id, agregando usuario actual:', item.data.id);
						item.data.cobrador_id = currentUser.id;
						await db.sync_queue.update(item.id, { data: item.data });
						await db.pagos.update(item.data.id, { cobrador_id: currentUser.id });
					}

					const { data: pago, error } = await supabase
						.from('pagos')
						.insert({
							id: item.data.id,
							tenant_id: item.data.tenant_id,
							credito_id: item.data.credito_id,
							cliente_id: item.data.cliente_id,
							cobrador_id: item.data.cobrador_id,
							monto: item.data.monto,
							fecha: item.data.fecha,
							latitud: item.data.latitud || null,
							longitud: item.data.longitud || null,
							observaciones: item.data.observaciones || null
						})
						.select()
						.single();

					if (!error && pago) {
						await db.pagos.put({ ...pago, synced: true });
						await db.sync_queue.delete(item.id);
						console.log('Pago sincronizado:', pago.id);
					} else if (error) {
						if (error.code === '23505') {
							await db.pagos.update(item.data.id, { synced: true });
							await db.sync_queue.delete(item.id);
							console.log('Pago ya existe en servidor:', item.data.id);
						} else {
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
				}
			} catch (error) {
				console.error('Error syncing item:', error);
			}
		}

		// 2. Descargar cambios de Supabase
		const { data: remotePagos, error } = await supabase
			.from('pagos')
			.select('*')
			.eq('tenant_id', '00000000-0000-0000-0000-000000000001');

		if (!error && remotePagos) {
			const remoteIds = new Set(remotePagos.map((p) => p.id));

			const localPagos = await db.pagos
				.where('tenant_id')
				.equals('00000000-0000-0000-0000-000000000001')
				.toArray();

			// 2.1. Eliminar pagos que ya no existen en Supabase
			for (const localPago of localPagos) {
				if (!remoteIds.has(localPago.id)) {
					console.log('Eliminando pago que no existe en servidor:', localPago.id);
					await db.pagos.delete(localPago.id);
				}
			}

			// 2.2. Agregar pagos desde Supabase (inmutables, no se actualizan)
			for (const remotePago of remotePagos) {
				const localPago = await db.pagos.get(remotePago.id);

				if (!localPago) {
					console.log('Agregando pago nuevo desde servidor:', remotePago.id);
					await db.pagos.add({
						...remotePago,
						synced: true
					});
				}
			}
		}

		syncCounter.update((n) => n + 1);
	} catch (error) {
		console.error('Sync error:', error);
		showNotification({
			type: 'error',
			message: 'Error al sincronizar pagos',
			duration: 3000
		});
	} finally {
		isSyncingPagos.set(false);
	}
}
