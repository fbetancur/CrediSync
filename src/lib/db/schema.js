import Dexie from 'dexie';

// Constantes para prioridades de sincronización
export const SYNC_PRIORITY = {
	HIGH: 1,
	NORMAL: 2,
	LOW: 3
};

export class CrediSyncDB extends Dexie {
	constructor() {
		super('credisync_db');
		
		this.version(1).stores({
			// Productos de crédito
			productos_credito: '++id, tenant_id, created_by, nombre, activo, synced, [tenant_id+activo]',
			
			// Clientes
			clientes: '++id, tenant_id, created_by, nombre, tipo_documento, numero_documento, telefono, telefono_2, direccion, barrio, referencia, nombre_fiador, telefono_fiador, latitud, longitud, synced, [tenant_id+created_by]',
			
			// Créditos otorgados
			creditos: '++id, tenant_id, created_by, cliente_id, producto_id, monto, estado, synced, [tenant_id+created_by], [tenant_id+estado]',
			
			// Cola de sincronización
			sync_queue: '++id, table, operation, timestamp, synced, retry_count, next_retry, priority',
			
			// Cache de usuarios del dispositivo
			device_users: '++id, email, tenant_id, role, last_login'
		});
	}
}

export const db = new CrediSyncDB();