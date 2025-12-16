/**
 * Gestor de sincronización bidireccional con Supabase
 * Maneja conflictos y garantiza consistencia de datos
 */

import { db } from '../db/optimized-schema.js';

export class SyncManager {
	constructor(supabaseClient) {
		this.supabase = supabaseClient;
		this.syncInProgress = false;
		this.lastSyncTime = null;
	}
	
	/**
	 * Sincronización completa: IndexedDB ↔ Supabase
	 */
	async fullSync(tenantId) {
		if (this.syncInProgress) {
			console.log('Sincronización ya en progreso...');
			return;
		}
		
		this.syncInProgress = true;
		
		try {
			console.log('🔄 Iniciando sincronización completa...');
			
			// 1. Subir cambios locales a Supabase
			await this.uploadLocalChanges(tenantId);
			
			// 2. Descargar cambios remotos de Supabase
			await this.downloadRemoteChanges(tenantId);
			
			// 3. Resolver conflictos si los hay
			await this.resolveConflicts(tenantId);
			
			this.lastSyncTime = Date.now();
			console.log('✅ Sincronización completada');
			
		} catch (error) {
			console.error('❌ Error en sincronización:', error);
			throw error;
		} finally {
			this.syncInProgress = false;
		}
	}
	
	/**
	 * Subir cambios locales no sincronizados
	 */
	async uploadLocalChanges(tenantId) {
		const tables = ['contacts', 'products', 'transactions', 'payments'];
		
		for (const tableName of tables) {
			// Obtener registros no sincronizados
			const unsyncedRecords = await db[tableName]
				.where('tenant_id').equals(tenantId)
				.and(record => !record.synced)
				.toArray();
			
			if (unsyncedRecords.length === 0) continue;
			
			console.log(`📤 Subiendo ${unsyncedRecords.length} registros de ${tableName}`);
			
			// Subir en lotes para evitar timeouts
			const batchSize = 50;
			for (let i = 0; i < unsyncedRecords.length; i += batchSize) {
				const batch = unsyncedRecords.slice(i, i + batchSize);
				
				try {
					const { error } = await this.supabase
						.from(tableName)
						.upsert(batch, { onConflict: 'id' });
					
					if (error) throw error;
					
					// Marcar como sincronizados
					const ids = batch.map(record => record.id);
					await db[tableName]
						.where('id').anyOf(ids)
						.modify({ synced: true, synced_at: Date.now() });
						
				} catch (error) {
					console.error(`Error subiendo lote de ${tableName}:`, error);
					// Continuar con el siguiente lote
				}
			}
		}
	}
	
	/**
	 * Descargar cambios remotos más recientes
	 */
	async downloadRemoteChanges(tenantId) {
		const tables = ['contacts', 'products', 'transactions', 'payments'];
		const lastSync = this.lastSyncTime || 0;
		
		for (const tableName of tables) {
			try {
				// Obtener registros modificados desde la última sincronización
				const { data: remoteRecords, error } = await this.supabase
					.from(tableName)
					.select('*')
					.eq('tenant_id', tenantId)
					.gt('updated_at', lastSync)
					.order('updated_at', { ascending: true });
				
				if (error) throw error;
				if (!remoteRecords || remoteRecords.length === 0) continue;
				
				console.log(`📥 Descargando ${remoteRecords.length} registros de ${tableName}`);
				
				// Actualizar registros locales
				for (const remoteRecord of remoteRecords) {
					await this.mergeRemoteRecord(tableName, remoteRecord);
				}
				
			} catch (error) {
				console.error(`Error descargando ${tableName}:`, error);
			}
		}
	}
	
	/**
	 * Fusionar registro remoto con local (manejo de conflictos)
	 */
	async mergeRemoteRecord(tableName, remoteRecord) {
		const localRecord = await db[tableName].get(remoteRecord.id);
		
		if (!localRecord) {
			// Registro nuevo, insertar directamente
			await db[tableName].add({ ...remoteRecord, synced: true });
			return;
		}
		
		// Verificar si hay conflicto (ambos modificados)
		if (localRecord.updated_at > remoteRecord.updated_at && !localRecord.synced) {
			// Conflicto: local más reciente y no sincronizado
			await this.handleConflict(tableName, localRecord, remoteRecord);
		} else {
			// Remoto más reciente o local ya sincronizado
			await db[tableName].update(remoteRecord.id, { 
				...remoteRecord, 
				synced: true 
			});
		}
	}
	
	/**
	 * Manejar conflictos de datos
	 */
	async handleConflict(tableName, localRecord, remoteRecord) {
		console.warn(`⚠️ Conflicto detectado en ${tableName}:`, {
			local: localRecord,
			remote: remoteRecord
		});
		
		// Estrategia: "Last Write Wins" + Log del conflicto
		const winner = localRecord.updated_at > remoteRecord.updated_at 
			? localRecord 
			: remoteRecord;
		
		// Guardar log del conflicto para auditoría
		await db.sync_log.add({
			tenant_id: localRecord.tenant_id,
			table_name: tableName,
			record_id: localRecord.id,
			action: 'conflict_resolved',
			conflict_data: {
				local: localRecord,
				remote: remoteRecord,
				winner: winner === localRecord ? 'local' : 'remote'
			},
			synced_at: Date.now(),
			synced: false
		});
		
		// Aplicar el ganador
		await db[tableName].update(localRecord.id, { 
			...winner, 
			synced: true,
			conflict_resolved: true
		});
	}
	
	/**
	 * Resolver conflictos pendientes
	 */
	async resolveConflicts(tenantId) {
		const conflicts = await db.sync_log
			.where('tenant_id').equals(tenantId)
			.and(log => log.action === 'conflict_resolved' && !log.synced)
			.toArray();
		
		if (conflicts.length > 0) {
			console.log(`🔧 Resolviendo ${conflicts.length} conflictos...`);
			
			// Marcar conflictos como procesados
			const conflictIds = conflicts.map(c => c.id);
			await db.sync_log
				.where('id').anyOf(conflictIds)
				.modify({ synced: true });
		}
	}
	
	/**
	 * Sincronización automática en background
	 */
	startAutoSync(tenantId, intervalMinutes = 5) {
		const interval = intervalMinutes * 60 * 1000;
		
		return setInterval(async () => {
			try {
				await this.fullSync(tenantId);
			} catch (error) {
				console.error('Error en sincronización automática:', error);
			}
		}, interval);
	}
	
	/**
	 * Obtener estadísticas de sincronización
	 */
	async getSyncStats(tenantId) {
		const tables = ['contacts', 'products', 'transactions', 'payments'];
		const stats = {
			lastSync: this.lastSyncTime,
			pending: {},
			conflicts: 0
		};
		
		for (const table of tables) {
			const pending = await db[table]
				.where('tenant_id').equals(tenantId)
				.and(record => !record.synced)
				.count();
			
			stats.pending[table] = pending;
		}
		
		stats.conflicts = await db.sync_log
			.where('tenant_id').equals(tenantId)
			.and(log => log.action === 'conflict_resolved')
			.count();
		
		return stats;
	}
}