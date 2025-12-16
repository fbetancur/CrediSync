import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Estado de conexión (verificar que estamos en el navegador)
export const isOnline = writable(browser ? navigator.onLine : true);

// Flags de sincronización por tabla (para evitar bloqueos)
export const isSyncing = writable(false); // Flag global (legacy)
export const isSyncingClientes = writable(false);
export const isSyncingCreditos = writable(false);
export const isSyncingPagos = writable(false);
export const isSyncingProductos = writable(false);
export const isSyncingCuotas = writable(false);

export const lastSync = writable(null);

// Contador de sincronizaciones completadas (para reactividad)
// Cada vez que se incrementa, los componentes que lo escuchan se actualizan
export const syncCounter = writable(0);

// Circuit breaker state
export const syncPaused = writable(false);
export const consecutiveFailures = writable(0);

// Health check state
export const pendingOperationsCount = writable(0);
export const oldestPendingOperation = writable(null);

// Escuchar cambios de conexión (solo en el navegador)
if (browser) {
	window.addEventListener('online', () => isOnline.set(true));
	window.addEventListener('offline', () => isOnline.set(false));
}
