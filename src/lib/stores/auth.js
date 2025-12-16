import { writable } from 'svelte/store';

// Store para el usuario actual
export const user = writable(null);

// Store para el estado de autenticación
export const isAuthenticated = writable(false);

// Función para simular login (temporal)
export function simulateLogin() {
	const mockUser = {
		id: 'user-123',
		email: 'demo@credisync.com',
		user_metadata: {
			tenant_id: 'demo-tenant',
			role: 'admin'
		}
	};
	
	user.set(mockUser);
	isAuthenticated.set(true);
}