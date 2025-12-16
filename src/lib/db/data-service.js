import { db } from './schema.js';
import { get } from 'svelte/store';
import { currentUser, currentTenant } from '../stores/simple-auth.js';

class DataService {
	getCurrentUser() {
		const user = get(currentUser);
		const tenant = get(currentTenant);
		
		if (!user || !tenant) {
			throw new Error('Usuario no autenticado. Por favor inicia sesión.');
		}
		
		return {
			id: user.id,
			email: user.email,
			tenant_id: user.tenant_id,
			role: user.rol
		};
	}

	/**
	 * Limpiar datos del usuario actual (para testing)
	 */
	async clearUserData() {
		const currentUser = this.getCurrentUser();
		const tables = ['productos_credito', 'clientes', 'creditos'];
		
		for (const table of tables) {
			await db[table]
				.where('tenant_id').equals(currentUser.tenant_id)
				.and(record => record.created_by === currentUser.id)
				.delete();
		}
	}

	/**
	 * Limpiar todos los datos de la empresa (solo admin)
	 */
	async clearTenantData() {
		const currentUser = this.getCurrentUser();
		
		if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
			throw new Error('Solo administradores pueden limpiar datos de empresa');
		}
		
		const tables = ['productos_credito', 'clientes', 'creditos'];
		
		for (const table of tables) {
			await db[table]
				.where('tenant_id').equals(currentUser.tenant_id)
				.delete();
		}
	}

	applySecurityFilters(table, tableName) {
		const currentUser = this.getCurrentUser();
		
		// Filtro obligatorio por empresa
		let filtered = table.where('tenant_id').equals(currentUser.tenant_id);
		
		// Filtros específicos por tabla y rol
		if (tableName === 'clientes' || tableName === 'creditos') {
			switch (currentUser.role) {
				case 'user':
				case 'viewer':
				case 'cobrador': // Mantener compatibilidad
					// Solo ven sus propios datos (scope: own)
					return filtered.and(record => record.created_by === currentUser.id);
				case 'manager':
				case 'supervisor': // Mantener compatibilidad
					// Ven todo del tenant (scope: tenant)
					return filtered;
				case 'admin':
					// Ven todo del tenant (scope: tenant)
					return filtered;
				default:
					// Por defecto, solo sus propios datos
					return filtered.and(record => record.created_by === currentUser.id);
			}
		}
		
		return filtered;
	}

	// PRODUCTOS DE CRÉDITO
	async getProductosCredito() {
		try {
			const currentUser = this.getCurrentUser();
			console.log('🔍 Obteniendo productos para tenant:', currentUser.tenant_id);
			
			// Consulta local (IndexedDB) - offline-first
			const productos = await db.productos_credito
				.where('tenant_id')
				.equals(currentUser.tenant_id)
				.and(record => record.activo === true)
				.toArray();
				
			console.log('✅ Productos encontrados (local):', productos.length);
			return productos;
		} catch (error) {
			console.error('❌ Error en getProductosCredito:', error);
			return [];
		}
	}

	async createProductoCredito(data) {
		const currentUser = this.getCurrentUser();
		const producto = {
			...data,
			id: crypto.randomUUID(),
			tenant_id: currentUser.tenant_id,
			created_by: currentUser.id,
			activo: true,
			created_at: Date.now(),
			synced: false
		};
		
		return await db.productos_credito.add(producto);
	}

	// CLIENTES
	async getClientes() {
		try {
			const currentUser = this.getCurrentUser();
			console.log('🔍 Obteniendo clientes para tenant:', currentUser.tenant_id, 'rol:', currentUser.role);
			
			// Aplicar filtros de seguridad por rol
			const filtered = this.applySecurityFilters(db.clientes, 'clientes');
			const clientes = await filtered.toArray();
				
			console.log('✅ Clientes encontrados (con filtros de rol):', clientes.length);
			return clientes;
		} catch (error) {
			console.error('❌ Error en getClientes:', error);
			return [];
		}
	}

	async createCliente(data) {
		const currentUser = this.getCurrentUser();
		const cliente = {
			...data,
			id: crypto.randomUUID(),
			tenant_id: currentUser.tenant_id,
			created_by: currentUser.id,
			created_at: Date.now(),
			updated_at: Date.now(),
			synced: false
		};
		
		console.log('💾 Guardando cliente:', cliente);
		return await db.clientes.add(cliente);
	}

	async deleteCliente(clienteId) {
		const currentUser = this.getCurrentUser();
		
		// Verificar que el cliente pertenece al usuario/tenant actual
		const cliente = await db.clientes
			.where('id').equals(clienteId)
			.and(record => record.tenant_id === currentUser.tenant_id)
			.first();
			
		if (!cliente) {
			throw new Error('Cliente no encontrado o no tienes permisos para eliminarlo');
		}
		
		// Verificar permisos según el rol
		if ((currentUser.role === 'user' || currentUser.role === 'viewer' || currentUser.role === 'cobrador') && cliente.created_by !== currentUser.id) {
			throw new Error('Solo puedes eliminar clientes que tú creaste');
		}
		
		console.log('🗑️ Eliminando cliente:', clienteId);
		return await db.clientes.delete(clienteId);
	}

	// CRÉDITOS
	async getCreditos() {
		const filtered = this.applySecurityFilters(db.creditos, 'creditos');
		return await filtered.toArray();
	}

	async createCredito(data) {
		const currentUser = this.getCurrentUser();
		const credito = {
			...data,
			id: crypto.randomUUID(),
			tenant_id: currentUser.tenant_id,
			created_by: currentUser.id,
			estado: 'activo',
			created_at: Date.now(),
			synced: false
		};
		
		return await db.creditos.add(credito);
	}
}

export const dataService = new DataService();