import { writable } from 'svelte/store';

export const notifications = writable([]);

let notificationId = 0;

export function showNotification({ type = 'info', message, duration = 5000, action = null, onAction = null }) {
	const id = notificationId++;
	
	const notification = {
		id,
		type, // 'info', 'success', 'warning', 'error'
		message,
		action,
		onAction,
		timestamp: Date.now()
	};
	
	notifications.update(n => [...n, notification]);
	
	if (duration > 0) {
		setTimeout(() => {
			dismissNotification(id);
		}, duration);
	}
	
	return id;
}

export function dismissNotification(id) {
	notifications.update(n => n.filter(notification => notification.id !== id));
}

export function clearAllNotifications() {
	notifications.set([]);
}
