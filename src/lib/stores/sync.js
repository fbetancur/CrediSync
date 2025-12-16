import { writable } from 'svelte/store';

// Estados de sincronización
export const isSyncingProductos = writable(false);
export const isSyncingClientes = writable(false);
export const isSyncingCreditos = writable(false);

// Contador de sincronizaciones (para debugging)
export const syncCounter = writable(0);

// Estado general de conectividad
export const isOnline = writable(typeof navigator !== 'undefined' ? navigator.onLine : true);

// Escuchar cambios de conectividad
if (typeof window !== 'undefined') {
	window.addEventListener('online', () => isOnline.set(true));
	window.addEventListener('offline', () => isOnline.set(false));
}