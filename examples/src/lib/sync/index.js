/**
 * Sincronización Global - CrediSync360
 * 
 * Este archivo centraliza TODA la sincronización bidireccional
 * para garantizar que TODOS los dispositivos estén sincronizados.
 * 
 * SINCRONIZACIÓN INTELIGENTE:
 * - Pausa durante actividad del usuario (scroll, clicks, typing)
 * - Reanuda después de 5s de inactividad
 * - Sync forzado cada 5 minutos máximo
 */

import { browser } from '$app/environment';
import { db } from '$lib/db/local.js';
import { syncToSupabase as syncClientes } from './clientes.js';
import { syncCreditosToSupabase } from './creditos.js';
import { syncPagosToSupabase } from './pagos.js';
import { syncProductosToSupabase } from './productos.js';
import { syncCuotasToSupabase } from './cuotas.js';

/**
 * Limpiar items corruptos de la cola de sincronización
 * Ejecutar al inicio de la app para eliminar items que fallan constantemente
 */
async function limpiarColaCorrupta() {
	try {
		console.log('🧹 [SYNC] Limpiando items corruptos de la cola...');
		
		const itemsCorruptos = await db.sync_queue
			.filter(item => {
				// Eliminar items que hayan fallado 5 veces
				if (item.retry_count >= 5) return true;
				
				// Eliminar items de créditos sin tenant_id
				if (item.table === 'creditos' && item.operation === 'update' && !item.data?.tenant_id) {
					return true;
				}
				
				return false;
			})
			.toArray();
		
		if (itemsCorruptos.length > 0) {
			console.log(`🗑️ [SYNC] Eliminando ${itemsCorruptos.length} items corruptos`);
			
			for (const item of itemsCorruptos) {
				await db.sync_queue.delete(item.id);
			}
			
			console.log('✅ [SYNC] Cola limpiada');
		} else {
			console.log('✅ [SYNC] No hay items corruptos');
		}
	} catch (error) {
		console.error('❌ [SYNC] Error limpiando cola:', error);
	}
}

// Estado de actividad del usuario
let userActive = false;
let inactivityTimer = null;
let lastSyncTime = 0;
const MAX_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutos en ms
const INACTIVITY_DELAY = 50000; // 50 segundos sin actividad

/**
 * Marcar usuario como activo
 */
function markUserActive() {
	if (!userActive) {
		console.log('👤 [SYNC] Usuario activo - pausando sincronización automática');
	}
	userActive = true;
	
	// Reiniciar timer de inactividad
	clearTimeout(inactivityTimer);
	inactivityTimer = setTimeout(() => {
		userActive = false;
		console.log('💤 [SYNC] Usuario inactivo (50s) - reanudando sincronización');
		
		// Sincronizar inmediatamente después de inactividad
		if (navigator.onLine) {
			syncAll();
		}
	}, INACTIVITY_DELAY);
}

/**
 * Sincronizar TODAS las tablas
 * Esta función se llama periódicamente y en eventos
 * @param {boolean} force - Si es true, ignora todas las restricciones y sincroniza inmediatamente
 */
export async function syncAll(force = false) {
	const now = Date.now();
	const timeSinceLastSync = now - lastSyncTime;
	
	// Si es forzado, ejecutar inmediatamente sin restricciones
	if (force) {
		console.log('🚀 [SYNC] Sincronización FORZADA - ignorando todas las restricciones');
	} else {
		// Sync forzado cada 5 minutos sin importar actividad
		const shouldForceSync = timeSinceLastSync >= MAX_SYNC_INTERVAL;
		if (shouldForceSync) {
			console.log('⏰ [SYNC] Sync forzado (5 min transcurridos) - ignorando actividad del usuario');
			force = true;
		}
		
		// Si el usuario está activo y no es forzado, posponer
		if (userActive && !force) {
			console.log('⏸️ [SYNC] Usuario activo - sincronización pospuesta');
			return;
		}
		
		// Si no es forzado y fue hace poco, saltar
		if (!force && timeSinceLastSync < 30000) {
			console.log(`⏭️ [SYNC] Sincronización reciente (hace ${Math.round(timeSinceLastSync/1000)}s) - saltando`);
			return;
		}
	}
	
	const startTime = Date.now();
	console.log('🔄 [SYNC] Iniciando sincronización de todas las tablas...');
	
	try {
		// Sincronizar en paralelo para mayor velocidad
		const results = await Promise.allSettled([
			syncClientes(),
			syncProductosToSupabase(),
			syncCreditosToSupabase(),
			syncPagosToSupabase(),
			syncCuotasToSupabase()
		]);
		
		const elapsed = Date.now() - startTime;
		lastSyncTime = Date.now();
		
		// Verificar resultados
		const failed = results.filter(r => r.status === 'rejected');
		if (failed.length > 0) {
			console.error(`❌ [SYNC] ${failed.length} tablas fallaron:`, failed);
			// Mostrar detalles de los errores
			failed.forEach((result, index) => {
				console.error(`   Tabla ${index + 1}:`, result.reason);
			});
		}
		
		const succeeded = results.filter(r => r.status === 'fulfilled');
		console.log(`✅ [SYNC] Completado en ${elapsed}ms - ${succeeded.length}/5 tablas exitosas`);
		
		// Retornar resultado para que el llamador sepa si hubo errores
		return {
			success: failed.length === 0,
			succeeded: succeeded.length,
			failed: failed.length,
			total: 5,
			elapsed
		};
	} catch (error) {
		console.error('❌ [SYNC] Error crítico en sincronización global:', error);
		throw error;
	}
}

/**
 * Configurar sincronización automática
 * Solo se ejecuta en el navegador
 */
if (browser) {
	console.log('🚀 [SYNC] Iniciando sincronización automática global...');
	
	// Limpiar cola corrupta al inicio
	limpiarColaCorrupta();
	
	// Detectar actividad del usuario (eventos que indican uso activo)
	const activityEvents = [
		'scroll',      // Usuario navegando
		'mousemove',   // Usuario moviendo el mouse
		'mousedown',   // Usuario haciendo clic
		'touchstart',  // Usuario tocando pantalla (móvil)
		'touchmove',   // Usuario deslizando (móvil)
		'keydown',     // Usuario escribiendo
		'click',       // Usuario haciendo clic
		'input'        // Usuario ingresando datos
	];
	
	activityEvents.forEach(eventName => {
		document.addEventListener(eventName, markUserActive, { passive: true });
	});
	
	console.log('👂 [SYNC] Detectores de actividad configurados:', activityEvents.join(', '));
	
	// 1. Sincronización periódica cada 30 segundos (respeta actividad del usuario)
	setInterval(() => {
		if (navigator.onLine) {
			syncAll(); // Respeta userActive, excepto si pasaron 5 min
		}
	}, 30000);
	
	// 2. Sincronizar al recuperar conexión (forzado - ignora actividad)
	window.addEventListener('online', () => {
		console.log('📡 [SYNC] Conexión restaurada - sincronizando (forzado)');
		syncAll(true);
	});
	
	// 3. Sincronizar cuando el usuario vuelve a la app (forzado - ignora actividad)
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && navigator.onLine) {
			console.log('👁️ [SYNC] App visible - sincronizando (forzado)');
			syncAll(true);
		}
	});
	
	// 4. Sincronizar cuando la app recupera el foco (forzado - ignora actividad)
	window.addEventListener('focus', () => {
		if (navigator.onLine) {
			console.log('🎯 [SYNC] App enfocada - sincronizando (forzado)');
			syncAll(true);
		}
	});
	
	// 5. Sincronización inicial después de 2 segundos (forzado - ignora actividad)
	setTimeout(() => {
		console.log('⏰ [SYNC] Sincronización inicial (forzado)');
		syncAll(true);
	}, 2000);
	
	console.log('✅ [SYNC] Sincronización automática configurada');
	console.log('⚙️ [SYNC] Configuración:');
	console.log('   • Intervalo periódico: 30s (respeta actividad)');
	console.log('   • Inactividad requerida: 50s');
	console.log('   • Sync forzado máximo: 5 min (ignora actividad)');
	console.log('   • Eventos que pausan sync:', activityEvents.length);
}
