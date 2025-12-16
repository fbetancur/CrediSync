import Dexie from 'dexie';

// Base de datos local con IndexedDB
export const db = new Dexie('CrediSync360');

// Versión 3: Esquema antiguo con user_id
db.version(3).stores({
	clientes: 'id, user_id, deleted',
	sync_queue: '++id, retry_count, next_retry, priority, synced',
	error_log: '++id, timestamp, type',
	conflicts: '++id, entity_id, created_at'
});

// Versión 4: Migración a created_by
db.version(4).stores({
	clientes: 'id, created_by, deleted',
	sync_queue: '++id, retry_count, next_retry, priority, synced',
	error_log: '++id, timestamp, type',
	conflicts: '++id, entity_id, created_at'
}).upgrade(tx => {
	// Migrar datos existentes de user_id a created_by
	return tx.table('clientes').toCollection().modify(cliente => {
		if (cliente.user_id && !cliente.created_by) {
			cliente.created_by = cliente.user_id;
		}
	});
});

// Versión 5: Agregar tabla productos_credito
db.version(5).stores({
	clientes: 'id, created_by, deleted',
	productos_credito: 'id, tenant_id, activo',
	sync_queue: '++id, retry_count, next_retry, priority, synced',
	error_log: '++id, timestamp, type',
	conflicts: '++id, entity_id, created_at'
});

// Versión 6: Agregar tablas creditos y pagos
db.version(6).stores({
	clientes: 'id, created_by, deleted',
	productos_credito: 'id, tenant_id, activo',
	creditos: 'id, tenant_id, cliente_id, estado, fecha_desembolso',
	pagos: 'id, tenant_id, credito_id, cliente_id, fecha',
	sync_queue: '++id, retry_count, next_retry, priority, synced',
	error_log: '++id, timestamp, type',
	conflicts: '++id, entity_id, created_at'
});

// Versión 7: Agregar tabla cuotas
db.version(7).stores({
	clientes: 'id, created_by, deleted',
	productos_credito: 'id, tenant_id, activo',
	creditos: 'id, tenant_id, cliente_id, estado, fecha_desembolso',
	pagos: 'id, tenant_id, credito_id, cliente_id, fecha',
	cuotas: 'id, credito_id, fecha_programada, estado, tenant_id, [credito_id+numero]',
	sync_queue: '++id, retry_count, next_retry, priority, synced',
	error_log: '++id, timestamp, type',
	conflicts: '++id, entity_id, created_at'
});

// Versión 8: Índices optimizados para rendimiento
db.version(8).stores({
	clientes: 'id, created_by, deleted, tenant_id, creditos_activos, estado, [tenant_id+creditos_activos], [tenant_id+estado]',
	productos_credito: 'id, tenant_id, activo, [tenant_id+activo]',
	creditos: 'id, tenant_id, cliente_id, estado, fecha_desembolso, [cliente_id+estado], [tenant_id+estado], [tenant_id+fecha_desembolso]',
	pagos: 'id, tenant_id, credito_id, cliente_id, fecha, [tenant_id+fecha], [credito_id+fecha], [cliente_id+fecha]',
	cuotas: 'id, credito_id, fecha_programada, estado, tenant_id, [credito_id+numero], [credito_id+fecha_programada], [credito_id+estado], [tenant_id+fecha_programada], [fecha_programada+estado]',
	sync_queue: '++id, retry_count, next_retry, priority, synced, [synced+next_retry], [table+synced]',
	error_log: '++id, timestamp, type, [type+timestamp]',
	conflicts: '++id, entity_id, created_at, [entity_id+created_at]'
});

// Estados de sincronización
export const SYNC_STATUS = {
	PENDING: 'pending',
	SYNCED: 'synced',
	ERROR: 'error'
};

// Prioridades de sincronización
export const SYNC_PRIORITY = {
	HIGH: 1,
	NORMAL: 2,
	LOW: 3
};
