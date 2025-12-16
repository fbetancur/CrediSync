import { db } from './schema.js';
import { get } from 'svelte/store';
import { user } from '../stores/optimized-auth.js';

class DataService {
	getCurrentUser() {
		const currentUser = get(user);
		if (!currentUser) {
			console.warn('No user logged in, using default demo user');
			return {
				id: '732219b5-c319-4e4d-ad65-222f2d5a69ef',
				email: 'admin@credisync.com',
				tenant_id: '00000000-0000-0000-0000-000000000001',
				role: 'admin'
			};
		}
		
		return {
			id: currentUser.id,
			email: currentUser.email,
			tenant_id: currentUser.user_metadata?.tenant_id || '00000000-0000-0000-0000-000000000001',
			role: currentUser.user_metadata?.role || 'cobrador'
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

	applySecurityFilters(collection, tableName) {
		const currentUser = this.getCurrentUser();
		
		// Filtro obligatorio por empresa
		let filtered = collection.where('tenant_id').equals(currentUser.tenant_id);
		
		// Filtros específicos por tabla y rol
		if (tableName === 'clientes' || tableName === 'creditos') {
			switch (currentUser.role) {
				case 'cobrador':
					return filtered.filter(record => record.created_by === currentUser.id);
				case 'supervisor':
					return filtered.filter(record => 
						record.created_by === currentUser.id || record.supervisor_id === currentUser.id
					);
				case 'admin':
					return filtered; // Ve todo de su empresa
			}
		}
		
		return filtered;
	}

	// PRODUCTOS DE CRÉDITO
	async getProductosCredito() {
		const collection = db.productos_credito.toCollection();
		const filtered = this.applySecurityFilters(collection, 'productos_credito');
		return await filtered.filter(record => record.activo === true).toArray();
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
		const collection = db.clientes.toCollection();
		const filtered = this.applySecurityFilters(collection, 'clientes');
		return await filtered.toArray();
	}

	async createCliente(data) {
		const currentUser = this.getCurrentUser();
		const cliente = {
			...data,
			id: crypto.randomUUID(),
			tenant_id: currentUser.tenant_id,
			created_by: currentUser.id,
			created_at: Date.now(),
			synced: false
		};
		
		return await db.clientes.add(cliente);
	}

	// CRÉDITOS
	async getCreditos() {
		const collection = db.creditos.toCollection();
		const filtered = this.applySecurityFilters(collection, 'creditos');
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