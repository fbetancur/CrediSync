/**
 * Store de autenticación multi-tenant
 * Maneja autenticación sin selector de empresa, con detección automática
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { loginWithSupabaseAuth, logoutFromSupabase, getCurrentSession, onAuthStateChange } from '../auth/supabase-auth-setup.js';

/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {Object} user_metadata
 */

/**
 * @typedef {Object} UserData
 * @property {string} id
 * @property {string} tenant_id
 * @property {string} email
 * @property {string} nombre
 * @property {string} rol
 * @property {boolean} activo
 */

/**
 * @typedef {Object} TenantData
 * @property {string} id
 * @property {string} nombre
 * @property {boolean} activo
 */

/**
 * @typedef {Object} RoleData
 * @property {string} id
 * @property {string} nombre
 * @property {Object} permisos
 * @property {boolean} es_admin
 */

/**
 * @typedef {Object} AuthState
 * @property {AuthUser} authUser
 * @property {UserData} userData
 * @property {TenantData} tenantData
 * @property {RoleData} roleData
 */

// Store principal de autenticación
/** @type {import('svelte/store').Writable<AuthState | null>} */
export const authState = writable(null);

// Stores derivados para fácil acceso
export const isAuthenticated = derived(authState, $authState => !!$authState);

export const currentUser = derived(authState, $authState => $authState?.userData || null);

export const currentTenant = derived(authState, $authState => $authState?.tenantData || null);

export const currentRole = derived(authState, $authState => $authState?.roleData || null);

export const userPermissions = derived(authState, $authState => {
	if (!$authState?.roleData) return {};
	return $authState.roleData.permisos || {};
});

export const isAdmin = derived(authState, $authState => {
	return $authState?.roleData?.es_admin || false;
});

// Store para estado de carga
export const authLoading = writable(false);

// Store para errores de autenticación
export const authError = writable(null);

/**
 * Login simplificado - solo email y password
 * @param {string} email - Email del usuario
 * @param {string} password - Password del usuario
 */
export async function login(email, password) {
	authLoading.set(true);
	authError.set(null);
	
	try {
		console.log('🔐 Iniciando login multi-tenant...');
		
		const result = await loginWithSupabaseAuth(email, password);
		
		// Establecer estado de autenticación
		authState.set(result);
		
		console.log('✅ Login exitoso:', {
			user: result.userData.nombre,
			tenant: result.tenantData.nombre,
			role: result.roleData.nombre
		});
		
		// Verificar que el estado se haya actualizado
		console.log('🔍 Estado después de set:', result ? 'AUTENTICADO' : 'NO AUTENTICADO');
		
		return result;
		
	} catch (error) {
		console.error('❌ Error en login:', error);
		authError.set(error.message);
		throw error;
	} finally {
		authLoading.set(false);
	}
}

/**
 * Logout
 */
export async function logout() {
	authLoading.set(true);
	
	try {
		await logoutFromSupabase();
		authState.set(null);
		authError.set(null);
		console.log('👋 Logout exitoso');
	} catch (error) {
		console.error('❌ Error en logout:', error);
		authError.set(error.message);
	} finally {
		authLoading.set(false);
	}
}

/**
 * Verificar permisos del usuario actual
 * @param {string} resource - Recurso (ej: 'clientes', 'creditos')
 * @param {string} action - Acción (ej: 'create', 'read', 'update', 'delete')
 * @returns {boolean}
 */
export function hasPermission(resource, action) {
	const state = getCurrentAuthState();
	
	if (!state?.roleData) return false;
	
	const permissions = state.roleData.permisos;
	
	// Admin total
	if (permissions.all === true) return true;
	
	// Verificar permisos específicos del recurso
	const resourcePermissions = permissions[resource];
	if (!resourcePermissions) return false;
	
	// Si es array, verificar si incluye la acción
	if (Array.isArray(resourcePermissions)) {
		return resourcePermissions.includes(action);
	}
	
	// Si es objeto, verificar propiedad específica
	if (typeof resourcePermissions === 'object') {
		return resourcePermissions[action] === true;
	}
	
	return false;
}

/**
 * Obtener estado actual de autenticación (síncrono)
 * @returns {AuthState | null}
 */
export function getCurrentAuthState() {
	let currentState = null;
	authState.subscribe(state => {
		currentState = state;
	})();
	return currentState;
}

/**
 * Obtener contexto del tenant actual
 * @returns {Object}
 */
export function getTenantContext() {
	const state = getCurrentAuthState();
	
	if (!state) return null;
	
	return {
		tenantId: state.tenantData.id,
		tenantName: state.tenantData.nombre,
		userId: state.userData.id,
		userName: state.userData.nombre,
		userEmail: state.userData.email,
		roleId: state.roleData.id,
		roleName: state.roleData.nombre,
		isAdmin: state.roleData.es_admin,
		permissions: state.roleData.permisos
	};
}

/**
 * Inicializar autenticación - verificar sesión existente
 */
export async function initAuth() {
	authLoading.set(true);
	
	try {
		console.log('🔄 Verificando sesión existente...');
		
		const session = await getCurrentSession();
		
		if (session) {
			authState.set(session);
			console.log('✅ Sesión restaurada:', {
				user: session.userData.nombre,
				tenant: session.tenantData.nombre
			});
		} else {
			console.log('ℹ️ No hay sesión activa');
			authState.set(null);
		}
		
	} catch (error) {
		console.error('❌ Error inicializando auth:', error);
		authError.set(null); // Limpiar error para no bloquear login
		authState.set(null); // Asegurar que no hay sesión
	} finally {
		authLoading.set(false);
	}
}

/**
 * Configurar listener de cambios de autenticación
 */
export function setupAuthListener() {
	return onAuthStateChange((event, session) => {
		console.log('🔄 Auth state changed:', event);
		
		if (session) {
			authState.set(session);
		} else {
			authState.set(null);
		}
	});
}

// Auto-inicializar en el browser
if (browser) {
	// Inicializar de forma asíncrona para no bloquear
	setTimeout(() => {
		initAuth().catch(error => {
			console.warn('Error en inicialización automática:', error);
			authLoading.set(false);
		});
	}, 100);
	
	setupAuthListener();
}

/**
 * Utilidades para templates
 */
export const authUtils = {
	hasPermission,
	getTenantContext,
	getCurrentAuthState
};