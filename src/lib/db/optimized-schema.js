import Dexie from 'dexie';

/**
 * Esquema optimizado para aplicaciones multiempresa offline-first
 * Arquitectura: Una sola base + Filtrado inteligente
 */
export class OptimizedAppDB extends Dexie {
	constructor() {
		super('credisync_app');
		
		this.version(1).stores({
			// Contactos/Clientes (genérico para cualquier negocio)
			contacts: '++id, tenant_id, created_by, name, document, [tenant_id+created_by], [tenant_id+status]',
			
			// Productos/Servicios
			products: '++id, tenant_id, created_by, name, active, [tenant_id+active], [tenant_id+created_by]',
			
			// Transacciones principales (créditos, ventas, etc.)
			transactions: '++id, tenant_id, created_by, contact_id, product_id, status, [tenant_id+created_by], [tenant_id+status], [tenant_id+contact_id]',
			
			// Pagos/Cobros
			payments: '++id, tenant_id, created_by, transaction_id, [tenant_id+created_by], [tenant_id+transaction_id]',
			
			// Cache de usuarios del dispositivo
			device_users: '++id, email, tenant_id, role, last_login, [tenant_id+role]',
			
			// Configuración de la app por empresa
			tenant_config: '++id, tenant_id, config_key, config_value, [tenant_id+config_key]',
			
			// Log de sincronización
			sync_log: '++id, tenant_id, table_name, record_id, action, synced_at, [tenant_id+synced_at]'
		});
		
		// Hooks para metadata automática
		this.contacts.hook('creating', this.addMetadata);
		this.products.hook('creating', this.addMetadata);
		this.transactions.hook('creating', this.addMetadata);
		this.payments.hook('creating', this.addMetadata);
	}
	
	/**
	 * Hook que agrega metadata automáticamente a todos los registros
	 */
	addMetadata = (primKey, obj, trans) => {
		const currentUser = this.getCurrentUser();
		if (!currentUser) {
			throw new Error('No user context available');
		}
		
		// Metadata obligatoria
		obj.id = obj.id || crypto.randomUUID();
		obj.tenant_id = currentUser.tenant_id;
		obj.created_by = currentUser.id;
		obj.user_role = currentUser.role;
		obj.created_at = obj.created_at || Date.now();
		obj.updated_at = Date.now();
		obj.synced = false;
		
		// Metadata adicional según el rol
		if (currentUser.role === 'manager') {
			obj.manager_id = currentUser.id;
		}
	};
	
	/**
	 * Obtener usuario actual del contexto global
	 */
	getCurrentUser() {
		// Esto se conectará con el store de Svelte
		return globalThis.currentUser || null;
	}
}

export const db = new OptimizedAppDB();