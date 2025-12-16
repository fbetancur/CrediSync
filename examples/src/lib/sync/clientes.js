import { db, SYNC_PRIORITY } from '$lib/db/local.js';
import { supabase } from '$lib/supabase.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';
import { 
	isSyncingClientes, 
	lastSync, 
	syncCounter, 
	syncPaused, 
	consecutiveFailures,
	pendingOperationsCount,
	oldestPendingOperation 
} from '$lib/stores/sync.js';
import { showNotification } from '$lib/stores/notifications.js';
import { browser } from '$app/environment';
import { calcularCamposCliente } from '$lib/utils/creditos.js';
import { validarCliente } from '$lib/utils/validaciones.js';

// Configuración del circuit breaker
const MAX_CONSECUTIVE_FAILURES = 5;
const CIRCUIT_BREAKER_TIMEOUT = 300000; // 5 minutos
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutos
const OLD_OPERATION_THRESHOLD = 3600000; // 1 hora

/**
 * Obtener todos los clientes (local-first)
 */
export async function getClientes() {
	const currentUser = get(user);
	if (!currentUser) return [];

	// Primero obtener de IndexedDB
	const localClientes = await db.clientes
		.where('created_by')
		.equals(currentUser.id)
		.and((c) => !c.deleted)
		.toArray();

	return localClientes;
}

/**
 * Actualizar campos calculados de un cliente
 * Esta función recalcula todos los campos derivados del cliente
 * basándose en sus créditos y pagos actuales
 * 
 * @param {string} clienteId - ID del cliente a actualizar
 * @returns {Object} Campos calculados actualizados
 */
export async function actualizarCamposCalculadosCliente(clienteId) {
	console.log('📊 [CLIENTE] Actualizando campos calculados para:', clienteId);

	// 1. Obtener cliente actual
	const cliente = await db.clientes.get(clienteId);
	if (!cliente) {
		console.error('❌ [CLIENTE] Cliente no encontrado:', clienteId);
		throw new Error(`Cliente ${clienteId} no encontrado`);
	}
	console.log('📊 [CLIENTE] Cliente encontrado:', cliente.nombre);

	// 2. Obtener créditos del cliente
	const creditos = await db.creditos
		.where('cliente_id')
		.equals(clienteId)
		.toArray();

	console.log(`📊 [CLIENTE] ${creditos.length} créditos encontrados`);
	if (creditos.length > 0) {
		console.log('📊 [CLIENTE] Créditos:', creditos.map(c => ({
			id: c.id,
			estado: c.estado,
			monto: c.monto_original,
			saldo: c.saldo_pendiente
		})));
	}

	// 3. Obtener pagos de cada crédito
	const pagosPorCredito = {};
	for (const credito of creditos) {
		const pagos = await db.pagos
			.where('credito_id')
			.equals(credito.id)
			.toArray();
		pagosPorCredito[credito.id] = pagos;
		console.log(`📊 [CLIENTE] Crédito ${credito.id}: ${pagos.length} pagos`);
	}

	// 4. Calcular campos usando la función de utilidades
	const camposCalculados = calcularCamposCliente(cliente, creditos, pagosPorCredito);

	console.log('📊 [CLIENTE] Campos calculados:', camposCalculados);
	console.log('📊 [CLIENTE] Campos actuales:', {
		creditos_activos: cliente.creditos_activos,
		saldo_total: cliente.saldo_total,
		dias_atraso_max: cliente.dias_atraso_max,
		estado: cliente.estado,
		score: cliente.score
	});

	// 5. Validar antes de guardar
	const clienteActualizado = {
		...cliente,
		...camposCalculados
	};
	validarCliente(clienteActualizado);

	// 6. Actualizar en IndexedDB
	await db.clientes.update(clienteId, {
		...camposCalculados,
		updated_at: new Date().toISOString(),
		synced: false
	});

	console.log('✅ [CLIENTE] Campos actualizados en IndexedDB');

	// 7. Agregar a cola de sincronización
	await db.sync_queue.add({
		table: 'clientes',
		operation: 'update',
		data: {
			id: clienteId,
			...camposCalculados,
			updated_at: new Date().toISOString()
		},
		timestamp: new Date().toISOString(),
		synced: false,
		retry_count: 0,
		next_retry: new Date().toISOString(),
		priority: SYNC_PRIORITY.NORMAL
	});

	console.log('✅ [CLIENTE] Agregado a cola de sincronización');

	return camposCalculados;
}

/**
 * Crear cliente (offline-first)
 */
export async function createCliente(clienteData) {
	const currentUser = get(user);
	if (!currentUser) throw new Error('No user logged in');

	const now = new Date().toISOString();
	const cliente = {
		id: crypto.randomUUID(),
		...clienteData,
		tenant_id: clienteData.tenant_id || '00000000-0000-0000-0000-000000000001',
		ruta_id: clienteData.ruta_id || '00000000-0000-0000-0000-000000000002',
		created_by: currentUser.id,
		created_at: now,
		updated_at: now,
		// Inicializar campos calculados (arquitectura offline-first)
		creditos_activos: 0,
		saldo_total: 0,
		dias_atraso_max: 0,
		estado: 'SIN_CREDITOS',
		score: 'REGULAR',
		synced: false,
		deleted: false
	};

	// Validar antes de guardar
	validarCliente(cliente);

	// Guardar localmente
	await db.clientes.add(cliente);

	// Agregar a cola de sincronización con prioridad NORMAL
	await db.sync_queue.add({
		table: 'clientes',
		operation: 'insert',
		data: cliente,
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.NORMAL
	});

	// Sincronizar inmediatamente (operación crítica)
	syncToSupabase();

	return cliente;
}

/**
 * Eliminar cliente (offline-first)
 */
export async function deleteCliente(id) {
	const now = new Date().toISOString();

	// Soft delete: marcar como eliminado localmente
	await db.clientes.update(id, {
		deleted: true,
		deleted_at: now,
		updated_at: now,
		synced: false
	});

	// Agregar a cola de sincronización con prioridad NORMAL
	await db.sync_queue.add({
		table: 'clientes',
		operation: 'delete',
		data: { id },
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.NORMAL
	});

	// Sincronizar inmediatamente
	syncToSupabase();
}

/**
 * Sincronizar con Supabase
 */
export async function syncToSupabase() {
	// Verificar si estamos offline
	if (!navigator.onLine) {
		console.log('Offline - sync postponed');
		return;
	}

	// Verificar si el circuit breaker está abierto
	if (get(syncPaused)) {
		console.log('Sync paused by circuit breaker');
		return;
	}

	const currentUser = get(user);
	if (!currentUser) return;

	// Evitar sincronizaciones concurrentes
	if (get(isSyncingClientes)) {
		console.log('Clientes sync already in progress');
		return;
	}

	isSyncingClientes.set(true);

	const MAX_RETRIES = 5;
	const now = new Date().toISOString();

	try {
		// 1. Subir cambios locales a Supabase (ordenados por prioridad)
		const pendingItems = await db.sync_queue
			.filter((item) => !item.synced && item.next_retry <= now && item.retry_count < MAX_RETRIES)
			.toArray();

		// Ordenar por prioridad (HIGH primero)
		pendingItems.sort((a, b) => (a.priority || SYNC_PRIORITY.NORMAL) - (b.priority || SYNC_PRIORITY.NORMAL));

		console.log('Pending items to sync:', pendingItems.length);

		for (const item of pendingItems) {
			try {
				if (item.operation === 'insert') {
					// Validar que tenga nombre (campo requerido)
					if (!item.data.nombre || item.data.nombre.trim() === '') {
						console.warn('⚠️ [CLIENTES-SYNC] Cliente sin nombre en cola, eliminando:', item.data.id);
						await db.sync_queue.delete(item.id);
						// También eliminar de IndexedDB si existe
						try {
							await db.clientes.delete(item.data.id);
							console.log('✅ [CLIENTES-SYNC] Cliente sin nombre eliminado de IndexedDB');
						} catch (err) {
							// Ignorar si no existe
						}
						continue;
					}

					// Usar UPSERT para idempotencia (previene duplicados)
					const { data: newCliente, error } = await supabase
						.from('clientes')
						.upsert(
							{
								id: item.data.id, // Mantener ID local
								tenant_id: item.data.tenant_id || '00000000-0000-0000-0000-000000000001',
								ruta_id: item.data.ruta_id || '00000000-0000-0000-0000-000000000002',
								nombre: item.data.nombre,
								tipo_documento: item.data.tipo_documento || 'CURP',
								numero_documento: item.data.numero_documento || item.data.cedula || '',
								telefono: item.data.telefono || null,
								telefono_2: item.data.telefono_2 || null,
								direccion: item.data.direccion || null,
								barrio: item.data.barrio || null,
								referencia: item.data.referencia || null,
								latitud: item.data.latitud || null,
								longitud: item.data.longitud || null,
								nombre_fiador: item.data.nombre_fiador || null,
								telefono_fiador: item.data.telefono_fiador || null,
								// Campos calculados (arquitectura offline-first)
								creditos_activos: item.data.creditos_activos || 0,
								saldo_total: item.data.saldo_total || 0,
								dias_atraso_max: item.data.dias_atraso_max || 0,
								estado: item.data.estado || 'SIN_CREDITOS',
								score: item.data.score || 'REGULAR',
								updated_at: item.data.updated_at
							},
							{ onConflict: 'id' }
						)
						.select()
						.single();

					if (error) {
						console.error('Insert error:', error);
					}

					if (!error && newCliente) {
						// Actualizar registro local con datos de Supabase
						await db.clientes.put({ ...newCliente, synced: true, deleted: false });
						// ELIMINAR de la cola
						await db.sync_queue.delete(item.id);
						console.log('Cliente sincronizado:', newCliente.id);
					} else if (error) {
						// Incrementar retry count con exponential backoff + jitter
						const retryCount = (item.retry_count || 0) + 1;
						const jitter = Math.random() * 1000; // 0-1 segundo de jitter
						const backoffMs = Math.min(1000 * Math.pow(2, retryCount) + jitter, 60000); // Max 1 min
						const nextRetry = new Date(Date.now() + backoffMs).toISOString();

						await db.sync_queue.update(item.id, {
							retry_count: retryCount,
							next_retry: nextRetry,
							last_error: error.message
						});

						// Persistir error para análisis
						await db.error_log.add({
							type: 'sync_error',
							operation: item.operation,
							table: item.table,
							error_message: error.message,
							retry_count: retryCount,
							timestamp: new Date().toISOString(),
							user_id: currentUser.id
						});

						console.error(`Sync failed, retry ${retryCount}/${MAX_RETRIES} in ${Math.round(backoffMs)}ms:`, error);
					}
				} else if (item.operation === 'delete') {
					const { error } = await supabase.from('clientes').delete().eq('id', item.data.id);

					if (!error) {
						// Eliminar de IndexedDB y de la cola
						await db.clientes.delete(item.data.id);
						await db.sync_queue.delete(item.id);
					}
				}
			} catch (error) {
				console.error('Error syncing item:', error);
			}
		}

		// 2. Descargar cambios de Supabase a local
		const { data: remoteClientes, error } = await supabase
			.from('clientes')
			.select('*')
			.eq('created_by', currentUser.id);

		if (error) {
			console.error('Error downloading from Supabase:', error);
			// No lanzar error, solo continuar con datos locales
		}

		if (!error && remoteClientes) {
			// Crear un Set con los IDs remotos para comparación rápida
			const remoteIds = new Set(remoteClientes.map((c) => c.id));

			// Obtener todos los clientes locales del usuario
			const localClientes = await db.clientes
				.where('created_by')
				.equals(currentUser.id)
				.toArray();

			// 2.1. Eliminar clientes que ya no existen en Supabase (con soft delete)
			for (const localCliente of localClientes) {
				if (!remoteIds.has(localCliente.id)) {
					// Verificar si ya está marcado como eliminado
					if (!localCliente.deleted) {
						// Soft delete primero
						console.log('Soft delete de cliente que no existe en servidor:', localCliente.id);
						await db.clientes.update(localCliente.id, {
							deleted: true,
							deleted_at: new Date().toISOString()
						});
					} else if (localCliente.deleted_at) {
						// Hard delete después de 30 días
						const deletedAge = Date.now() - new Date(localCliente.deleted_at).getTime();
						if (deletedAge > 30 * 24 * 60 * 60 * 1000) {
							console.log('Hard delete de cliente antiguo:', localCliente.id);
							await db.clientes.delete(localCliente.id);
						}
					}
				}
			}

			// 2.2. Agregar o actualizar clientes desde Supabase
			for (const remoteCliente of remoteClientes) {
				const localCliente = await db.clientes.get(remoteCliente.id);

				if (!localCliente) {
					// No existe localmente, agregarlo
					console.log('Agregando cliente nuevo desde servidor:', remoteCliente.id);
					await db.clientes.add({
						...remoteCliente,
						synced: true,
						deleted: false
					});
				} else {
					// Existe localmente, verificar si necesita actualización
					const remoteDate = new Date(remoteCliente.updated_at);
					const localDate = new Date(localCliente.updated_at);

					if (remoteDate > localDate) {
						// El remoto es más reciente, actualizar local
						console.log('Actualizando cliente desde servidor:', remoteCliente.id);
						await db.clientes.put({
							...remoteCliente,
							synced: true,
							deleted: false
						});
					} else if (localCliente.synced === false) {
						// Local tiene cambios pendientes, mantener local
						console.log('Manteniendo cambios locales pendientes:', localCliente.id);
					} else {
						// Están sincronizados, marcar como tal
						await db.clientes.update(remoteCliente.id, { synced: true });
					}
				}
			}
		}

		lastSync.set(new Date().toISOString());
		
		// Incrementar contador para notificar a componentes que hubo cambios
		syncCounter.update((n) => n + 1);

		// Reset consecutive failures en caso de éxito
		consecutiveFailures.set(0);

	} catch (error) {
		console.error('Sync error:', error);

		// Incrementar contador de fallos consecutivos
		const failures = get(consecutiveFailures) + 1;
		consecutiveFailures.set(failures);

		// Persistir error para análisis
		try {
			await db.error_log.add({
				type: 'sync_error_global',
				error_message: error.message,
				error_stack: error.stack,
				timestamp: new Date().toISOString(),
				user_id: currentUser.id
			});

			// Enviar a Supabase para monitoreo (sin bloquear)
			supabase.from('error_logs').insert({
				type: 'sync_error_global',
				error_message: error.message,
				user_id: currentUser.id,
				timestamp: new Date().toISOString()
			}).then(() => {}).catch(() => {}); // Fire and forget
		} catch (logError) {
			console.error('Error logging failed:', logError);
		}

		// Activar circuit breaker si hay muchos fallos
		if (failures >= MAX_CONSECUTIVE_FAILURES) {
			syncPaused.set(true);
			
			showNotification({
				type: 'warning',
				message: 'Sincronización pausada temporalmente debido a errores. Se reintentará en 5 minutos.',
				duration: 10000
			});

			// Reabrir circuit breaker después del timeout
			setTimeout(() => {
				syncPaused.set(false);
				consecutiveFailures.set(0);
				console.log('Circuit breaker reset - resuming sync');
				
				showNotification({
					type: 'info',
					message: 'Sincronización reanudada',
					duration: 3000
				});
			}, CIRCUIT_BREAKER_TIMEOUT);
		} else {
			// Mostrar notificación de error
			showNotification({
				type: 'error',
				message: 'Error al sincronizar. Reintentando automáticamente...',
				duration: 3000
			});
		}

	} finally {
		isSyncingClientes.set(false);
	}
}

/**
 * Health Check: Verificar estado de sincronización
 */
export async function checkSyncHealth() {
	try {
		// Contar operaciones pendientes
		const pending = await db.sync_queue
			.filter(item => !item.synced)
			.count();
		
		pendingOperationsCount.set(pending);

		// Obtener operación más antigua
		const oldest = await db.sync_queue
			.filter(item => !item.synced)
			.sortBy('timestamp');

		if (oldest.length > 0) {
			const oldestItem = oldest[0];
			const age = Date.now() - new Date(oldestItem.timestamp).getTime();
			
			oldestPendingOperation.set({
				age,
				timestamp: oldestItem.timestamp,
				operation: oldestItem.operation,
				table: oldestItem.table
			});

			// Alertar si hay operaciones muy antiguas
			if (age > OLD_OPERATION_THRESHOLD) {
				showNotification({
					type: 'warning',
					message: `Hay cambios sin sincronizar desde hace ${Math.round(age / 60000)} minutos`,
					duration: 10000,
					action: 'Sincronizar ahora',
					onAction: () => syncToSupabase()
				});
			}
		} else {
			oldestPendingOperation.set(null);
		}

		// Limpiar operaciones que excedieron max retries
		const failedItems = await db.sync_queue
			.filter(item => !item.synced && item.retry_count >= 5)
			.toArray();

		if (failedItems.length > 0) {
			showNotification({
				type: 'error',
				message: `${failedItems.length} operaciones fallaron después de 5 intentos`,
				duration: 0, // No auto-dismiss
				action: 'Ver detalles',
				onAction: () => {
					console.log('Failed operations:', failedItems);
					// Aquí podrías abrir un modal con detalles
				}
			});
		}

		// Limpiar hard deletes antiguos
		const deletedClientes = await db.clientes
			.filter(c => c.deleted && c.deleted_at)
			.toArray();

		for (const cliente of deletedClientes) {
			const deletedAge = Date.now() - new Date(cliente.deleted_at).getTime();
			if (deletedAge > 30 * 24 * 60 * 60 * 1000) {
				await db.clientes.delete(cliente.id);
				console.log('Cleaned up old deleted cliente:', cliente.id);
			}
		}

	} catch (error) {
		console.error('Health check error:', error);
	}
}

/**
 * Verificar integridad de la base de datos
 */
export async function verifyDatabaseIntegrity() {
	try {
		// Intentar contar registros
		await db.clientes.count();
		await db.sync_queue.count();
		return true;
	} catch (error) {
		console.error('Database corruption detected:', error);
		
		showNotification({
			type: 'error',
			message: 'Se detectó un problema con la base de datos local. Reconstruyendo...',
			duration: 5000
		});

		try {
			// Intentar recuperar desde Supabase
			await db.delete();
			await db.open();
			await syncToSupabase();
			
			showNotification({
				type: 'success',
				message: 'Base de datos reconstruida exitosamente',
				duration: 3000
			});
			
			return true;
		} catch (recoveryError) {
			console.error('Database recovery failed:', recoveryError);
			
			showNotification({
				type: 'error',
				message: 'No se pudo recuperar la base de datos. Por favor, cierre sesión y vuelva a iniciar.',
				duration: 0
			});
			
			return false;
		}
	}
}

/**
 * NOTA: La sincronización automática ahora está centralizada en src/lib/sync/index.js
 * Este archivo solo exporta las funciones de sincronización para ser llamadas desde allí.
 * 
 * Health check y verificación de integridad se mantienen aquí porque son específicos de clientes.
 */
if (browser) {
	// Health check periódico cada 5 minutos
	setInterval(() => {
		checkSyncHealth();
	}, HEALTH_CHECK_INTERVAL);

	// Verificar integridad al iniciar
	verifyDatabaseIntegrity().then(isHealthy => {
		if (isHealthy) {
			console.log('Database integrity verified');
		}
	});

	// Health check inicial
	setTimeout(() => {
		checkSyncHealth();
	}, 5000); // Después de 5 segundos de cargar la app
}
