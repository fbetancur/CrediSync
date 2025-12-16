import { db, SYNC_PRIORITY } from '$lib/db/local.js';
import { supabase } from '$lib/supabase.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';
import { isSyncingProductos, syncCounter } from '$lib/stores/sync.js';
import { showNotification } from '$lib/stores/notifications.js';

/**
 * Obtener todos los productos (local-first)
 */
export async function getProductos() {
	const currentUser = get(user);
	if (!currentUser) return [];

	// Obtener de IndexedDB
	const localProductos = await db.productos_credito
		.where('tenant_id')
		.equals('00000000-0000-0000-0000-000000000001')
		.toArray();

	return localProductos;
}

/**
 * Crear producto (offline-first)
 */
export async function createProducto(productoData) {
	const currentUser = get(user);
	if (!currentUser) throw new Error('No user logged in');

	const now = new Date().toISOString();
	const producto = {
		id: crypto.randomUUID(),
		...productoData,
		tenant_id: '00000000-0000-0000-0000-000000000001',
		created_by: currentUser.id,
		created_at: now,
		updated_at: now,
		synced: false
	};

	// Guardar localmente
	await db.productos_credito.add(producto);

	// Agregar a cola de sincronización
	await db.sync_queue.add({
		table: 'productos_credito',
		operation: 'insert',
		data: producto,
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.NORMAL
	});

	// Sincronizar inmediatamente
	syncProductosToSupabase();

	return producto;
}

/**
 * Actualizar producto (offline-first)
 */
export async function updateProducto(id, productoData) {
	const now = new Date().toISOString();
	
	// Obtener el producto completo de IndexedDB
	const productoExistente = await db.productos_credito.get(id);
	if (!productoExistente) {
		throw new Error('Producto no encontrado');
	}
	
	const updatedData = {
		...productoData,
		updated_at: now,
		synced: false
	};

	// Actualizar localmente
	await db.productos_credito.update(id, updatedData);

	// Agregar a cola de sincronización con TODOS los campos necesarios
	await db.sync_queue.add({
		table: 'productos_credito',
		operation: 'update',
		data: { 
			...productoExistente,  // Incluir todos los campos existentes
			...updatedData,        // Sobrescribir con los campos actualizados
			id                     // Asegurar que el ID esté presente
		},
		timestamp: now,
		synced: false,
		retry_count: 0,
		next_retry: now,
		priority: SYNC_PRIORITY.NORMAL
	});

	// Sincronizar inmediatamente
	syncProductosToSupabase();
}

/**
 * Cambiar estado activo/inactivo (offline-first)
 */
export async function toggleProductoActivo(id, activo) {
	await updateProducto(id, { activo });
}

/**
 * Limpiar operaciones fallidas de la cola
 */
export async function limpiarColaProductos() {
	try {
		const failedItems = await db.sync_queue
			.filter(item => item.table === 'productos_credito' && item.retry_count >= 5)
			.toArray();
		
		console.log('Limpiando operaciones fallidas de productos:', failedItems.length);
		
		for (const item of failedItems) {
			await db.sync_queue.delete(item.id);
		}
		
		console.log('Cola de productos limpiada');
		return failedItems.length;
	} catch (error) {
		console.error('Error limpiando cola:', error);
		return 0;
	}
}

/**
 * Sincronizar productos con Supabase
 */
export async function syncProductosToSupabase() {
	if (!navigator.onLine) {
		console.log('Offline - sync postponed');
		return;
	}

	const currentUser = get(user);
	if (!currentUser) return;

	if (get(isSyncingProductos)) {
		console.log('Productos sync already in progress');
		return;
	}

	isSyncingProductos.set(true);

	const MAX_RETRIES = 5;
	const now = new Date().toISOString();

	try {
		// 1. Subir cambios locales a Supabase
		const pendingItems = await db.sync_queue
			.filter((item) => 
				item.table === 'productos_credito' && 
				!item.synced && 
				item.next_retry <= now && 
				item.retry_count < MAX_RETRIES
			)
			.toArray();

		console.log('Pending productos to sync:', pendingItems.length);

		for (const item of pendingItems) {
			try {
				if (item.operation === 'insert' || item.operation === 'update') {
					const { data: producto, error } = await supabase
						.from('productos_credito')
						.upsert(
							{
								id: item.data.id,
								tenant_id: item.data.tenant_id,
								nombre: item.data.nombre,
								interes_porcentaje: item.data.interes_porcentaje,
								numero_cuotas: item.data.numero_cuotas,
								frecuencia: item.data.frecuencia,
								monto_minimo: item.data.monto_minimo,
								monto_maximo: item.data.monto_maximo,
								excluir_domingos: item.data.excluir_domingos || false,
								activo: item.data.activo !== undefined ? item.data.activo : true,
								updated_at: item.data.updated_at
							},
							{ onConflict: 'id' }
						)
						.select()
						.single();

					if (!error && producto) {
						await db.productos_credito.put({ ...producto, synced: true });
						await db.sync_queue.delete(item.id);
						console.log('Producto sincronizado:', producto.id);
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
		const { data: remoteProductos, error } = await supabase
			.from('productos_credito')
			.select('*')
			.eq('tenant_id', '00000000-0000-0000-0000-000000000001');

		if (!error && remoteProductos) {
			// Crear Set de IDs remotos para comparación rápida
			const remoteIds = new Set(remoteProductos.map((p) => p.id));

			// Obtener todos los productos locales
			const localProductos = await db.productos_credito
				.where('tenant_id')
				.equals('00000000-0000-0000-0000-000000000001')
				.toArray();

			// 2.1. Eliminar productos que ya no existen en Supabase
			for (const localProducto of localProductos) {
				if (!remoteIds.has(localProducto.id)) {
					console.log('Eliminando producto que no existe en servidor:', localProducto.id);
					await db.productos_credito.delete(localProducto.id);
				}
			}

			// 2.2. Agregar o actualizar productos desde Supabase
			for (const remoteProducto of remoteProductos) {
				const localProducto = await db.productos_credito.get(remoteProducto.id);

				if (!localProducto) {
					// No existe localmente, agregarlo
					console.log('Agregando producto nuevo desde servidor:', remoteProducto.id);
					await db.productos_credito.add({
						...remoteProducto,
						synced: true
					});
				} else {
					// Existe localmente, verificar si necesita actualización
					const remoteDate = new Date(remoteProducto.updated_at);
					const localDate = new Date(localProducto.updated_at);

					if (remoteDate > localDate) {
						// El remoto es más reciente, actualizar local
						console.log('Actualizando producto desde servidor:', remoteProducto.id);
						await db.productos_credito.put({
							...remoteProducto,
							synced: true
						});
					} else if (localProducto.synced === false) {
						// Local tiene cambios pendientes, mantener local
						console.log('Manteniendo cambios locales pendientes:', localProducto.id);
					} else {
						// Están sincronizados, marcar como tal
						await db.productos_credito.update(remoteProducto.id, { synced: true });
					}
				}
			}
		}

		syncCounter.update((n) => n + 1);

	} catch (error) {
		console.error('Sync error:', error);
		showNotification({
			type: 'error',
			message: 'Error al sincronizar productos',
			duration: 3000
		});
	} finally {
		isSyncingProductos.set(false);
	}
}
