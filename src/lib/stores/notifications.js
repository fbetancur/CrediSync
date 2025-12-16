import { writable } from 'svelte/store';

// Store para notificaciones
export const notifications = writable([]);

/**
 * Mostrar una notificación
 * @param {Object} notification - Objeto de notificación
 * @param {string} notification.type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {string} notification.message - Mensaje a mostrar
 * @param {number} [notification.duration=5000] - Duración en ms (0 = permanente)
 */
export function showNotification({ type, message, duration = 5000 }) {
	const id = crypto.randomUUID();
	const notification = {
		id,
		type,
		message,
		timestamp: Date.now()
	};

	// Agregar notificación
	notifications.update(items => [...items, notification]);

	// Auto-remover después del tiempo especificado
	if (duration > 0) {
		setTimeout(() => {
			removeNotification(id);
		}, duration);
	}

	return id;
}

/**
 * Remover una notificación específica
 * @param {string} id - ID de la notificación
 */
export function removeNotification(id) {
	notifications.update(items => items.filter(item => item.id !== id));
}

/**
 * Limpiar todas las notificaciones
 */
export function clearNotifications() {
	notifications.set([]);
}