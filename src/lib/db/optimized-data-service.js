import { db } from './optimized-schema.js';
import { get } from 'svelte/store';
import { user } from '../stores/optimized-auth.js';
import { supabase } from '../supabase.js';

/**
 * Servicio de datos optimizado con filtrado automático de seguridad
 * Arquitectura: Una sola base + Filtrado inteligente por roles
 */
class OptimizedDataService {
	
	/**
	 * Obtener contexto del usuario actual
	 */
	getCurrentUser() {
		const currentUser = get(user);
		if (!currentUser) {
			// Fallback para desarrollo - en producción esto debería redirigir al login
			console.warn('No user logged in, using demo context');
			return {
				id: 'demo-user',
				email: 'demo@app.com',
				tenant_id: 'demo-tenant',
				role: 'admin'
			};
		}
		
		return {
			id: currentUser.id,
			email: currentUser.email,
			tenant_id: currentUser.user_metadata?.tenant_id || 'demo-tenant',
			role: currentUser.user_metadata?.role || 'user'
		};
	}
	
	/**
	 * Aplicar filtros de seguridad automáticos según el rol
	 * @param {Dexie.Collection} collection - Colección de Dexie
	 * @param {string} tableName - Nombre de la tabla
	 * @returns {Dexie.Collection} - Colección filtrada
	 */
	applySecurityFilters(collection, tableName) {
		const currentUser = this.getCurrentUser();
		
		// Filtro obligatorio: Solo datos de la empresa del usuario
		let filtered = collection.where('tenant_id').equals(currentUser.tenant_id);
		
		// Filtros adicionales según el rol (SISTEMA COMPLETO)
		switch (currentUser.role) {
			case 'cobrador':
			case 'user':
				// Cobrador: Solo sus propios registros
				return filtered.filter(record => record.created_by === currentUser.id);
				
			case 'supervisor':
			case 'manager':
				// Supervisor: Sus registros + los de su equipo
				return filtered.filter(record => 
					record.created_by === currentUser.id || 
					record.supervisor_id === currentUser.id ||
					// También incluir registros donde el supervisor es el creador del usuario que creó el registro
					this.isInSupervisorTeam(record.created_by, currentUser.id)
				);
				
			case 'admin':
				// Admin: Todo de su empresa
				return filtered;
				
			case 'superadmin':
				// Superadmin: Acceso total (sin filtro de tenant)
				return collection.toCollection();
				
			default:
				throw new Error(`Rol no válido: ${currentUser.role}`);
		}
	}
	
	/**
	 * Verificar si un usuario está en el equipo de un supervisor (recursivo)
	 */
	async isInSupervisorTeam(userId, supervisorId) {
		try {
			// Obtener información del usuario desde Supabase
			const { data: user, error } = await supabase
				.from('users')
				.select('supervisor_id, rol')
				.eq('id', userId)
				.single();
			
			if (error || !user) return false;
			
			// Verificación directa
			if (user.supervisor_id === supervisorId) return true;
			
			// Verificación recursiva para jerarquías multinivel
			if (user.supervisor_id) {
				return await this.isInSupervisorTeam(user.supervisor_id, supervisorId);
			}
			
			return false;
		} catch (error) {
			console.warn('Error verificando equipo de supervisor:', error);
			return false;
		}
	}
	
	/**
	 * Obtener todos los usuarios bajo la supervisión de un usuario (recursivo)
	 */
	async getTeamMembers(supervisorId) {
		try {
			const { data: directReports, error } = await supabase
				.from('users')
				.select('id, nombre, email, rol, supervisor_id')
				.eq('supervisor_id', supervisorId)
				.eq('activo', true);
			
			if (error) throw error;
			
			let allMembers = [...(directReports || [])];
			
			// Obtener miembros de equipos subordinados recursivamente
			for (const member of directReports || []) {
				if (member.rol === 'supervisor') {
					const subTeam = await this.getTeamMembers(member.id);
					allMembers = [...allMembers, ...subTeam];
				}
			}
			
			return allMembers;
		} catch (error) {
			console.error('Error obteniendo miembros del equipo:', error);
			return [];
		}
	}
	
	/**
	 * Método genérico para obtener registros con filtrado automático
	 */
	async getRecords(tableName, additionalFilters = {}) {
		let collection = db[tableName].toCollection();
		
		// Aplicar filtros de seguridad
		collection = this.applySecurityFilters(collection, tableName);
		
		// Aplicar filtros adicionales
		Object.entries(additionalFilters).forEach(([key, value]) => {
			collection = collection.filter(record => record[key] === value);
		});
		
		return await collection.toArray();
	}
	
	/**
	 * Método genérico para crear registros con metadata automática
	 */
	async createRecord(tableName, data) {
		const currentUser = this.getCurrentUser();
		
		const record = {
			...data,
			// Metadata se agrega automáticamente por el hook de Dexie
		};
		
		// Establecer contexto global para el hook
		globalThis.currentUser = currentUser;
		
		try {
			const result = await db[tableName].add(record);
			
			// Log para sincronización
			await this.logSyncAction(tableName, record.id, 'create');
			
			return result;
		} finally {
			// Limpiar contexto
			globalThis.currentUser = null;
		}
	}
	
	/**
	 * Registrar acción para sincronización
	 */
	async logSyncAction(tableName, recordId, action) {
		const currentUser = this.getCurrentUser();
		
		await db.sync_log.add({
			tenant_id: currentUser.tenant_id,
			table_name: tableName,
			record_id: recordId,
			action: action,
			user_id: currentUser.id,
			synced_at: Date.now(),
			synced: false
		});
	}
	
	// ==========================================
	// MÉTODOS ESPECÍFICOS DE LA APLICACIÓN
	// ==========================================
	
	/**
	 * CONTACTOS/CLIENTES
	 */
	async getContacts(filters = {}) {
		return await this.getRecords('contacts', { status: 'active', ...filters });
	}
	
	async createContact(contactData) {
		return await this.createRecord('contacts', {
			...contactData,
			status: 'active'
		});
	}
	
	/**
	 * PRODUCTOS
	 */
	async getProducts(filters = {}) {
		return await this.getRecords('products', { active: true, ...filters });
	}
	
	async createProduct(productData) {
		return await this.createRecord('products', {
			...productData,
			active: true
		});
	}
	
	/**
	 * TRANSACCIONES (CRÉDITOS)
	 */
	async getTransactions(filters = {}) {
		return await this.getRecords('transactions', filters);
	}
	
	async createTransaction(transactionData) {
		return await this.createRecord('transactions', {
			...transactionData,
			status: 'active'
		});
	}
	
	/**
	 * PAGOS
	 */
	async getPayments(transactionId = null) {
		const filters = transactionId ? { transaction_id: transactionId } : {};
		return await this.getRecords('payments', filters);
	}
	
	async createPayment(paymentData) {
		return await this.createRecord('payments', paymentData);
	}
	
	/**
	 * UTILIDADES DE DESARROLLO
	 */
	
	/**
	 * Obtener estadísticas por rol (para debugging)
	 */
	async getStats() {
		const currentUser = this.getCurrentUser();
		
		const stats = {
			user: currentUser,
			tenant_id: currentUser.tenant_id,
			role: currentUser.role,
			counts: {}
		};
		
		// Contar registros por tabla
		const tables = ['contacts', 'products', 'transactions', 'payments'];
		
		for (const table of tables) {
			const records = await this.getRecords(table);
			stats.counts[table] = records.length;
		}
		
		return stats;
	}
	
	/**
	 * Limpiar datos del usuario actual (para testing)
	 */
	async clearUserData() {
		const currentUser = this.getCurrentUser();
		const tables = ['contacts', 'products', 'transactions', 'payments'];
		
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
		
		const tables = ['contacts', 'products', 'transactions', 'payments'];
		
		for (const table of tables) {
			await db[table]
				.where('tenant_id').equals(currentUser.tenant_id)
				.delete();
		}
	}
}

export const dataService = new OptimizedDataService();