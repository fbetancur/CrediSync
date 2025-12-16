import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { supabase } from '../supabase.js';

/**
 * Store de autenticación optimizado que se conecta dinámicamente a Supabase
 * Carga usuarios y empresas automáticamente desde la base de datos
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {Object} user_metadata
 * @property {string} user_metadata.tenant_id
 * @property {string} user_metadata.tenant_name
 * @property {string} user_metadata.role
 * @property {string} user_metadata.full_name
 */

/**
 * @typedef {Object} Company
 * @property {string} id
 * @property {string} name
 */

// Store principal del usuario
/** @type {import('svelte/store').Writable<User | null>} */
export const user = writable(null);

// Store derivado para el estado de autenticación
export const isAuthenticated = derived(user, $user => !!$user);

// Store derivado para el contexto actual
export const userContext = derived(user, ($user) => {
	if (!$user) return null;
	
	return {
		id: $user.id,
		email: $user.email,
		tenant_id: $user.user_metadata?.tenant_id,
		tenant_name: $user.user_metadata?.tenant_name,
		role: $user.user_metadata?.role,
		full_name: $user.user_metadata?.full_name
	};
});

// Stores para datos dinámicos
/** @type {import('svelte/store').Writable<Company[]>} */
export const companies = writable([]);
/** @type {import('svelte/store').Writable<Record<string, any[]>>} */
export const companyUsers = writable({});
export const loading = writable(false);

/**
 * Cargar empresas dinámicamente desde Supabase
 */
export async function loadCompanies() {
	loading.set(true);
	
	try {
		console.log('🔄 Cargando empresas desde Supabase...');
		
		// Obtener empresas únicas de la tabla users
		const { data: users, error } = await supabase
			.from('users')
			.select('tenant_id')
			.eq('activo', true);
		
		if (error) {
			console.error('❌ Error de Supabase:', error);
			throw error;
		}
		
		console.log('✅ Usuarios obtenidos:', users);
		
		// Extraer tenant_ids únicos y obtener nombres reales
		const uniqueTenants = [...new Set(users.map(u => u.tenant_id))];
		
		// Obtener información de empresas desde Supabase
		const { data: tenantsData, error: tenantsError } = await supabase
			.from('tenants')
			.select('id, nombre')
			.in('id', uniqueTenants);
		
		/** @type {Company[]} */
		let companiesData;
		
		if (tenantsError || !tenantsData) {
			console.warn('⚠️ No se pudo obtener tabla tenants, usando nombres por defecto');
			// Si no existe tabla tenants, usar nombres por defecto basados en los datos conocidos
			/** @type {Record<string, string>} */
			const defaultNames = {
				'00000000-0000-0000-0000-000000000001': 'CrediSync',
				'11111111-1111-1111-1111-111111111111': 'Inversiones Paisa',
				'22222222-2222-2222-2222-222222222222': 'México'
			};
			
			companiesData = uniqueTenants.map(tenantId => ({
				id: tenantId,
				name: defaultNames[tenantId] || `Empresa ${tenantId.slice(0, 8)}`
			}));
		} else {
			// Usar nombres reales de la tabla tenants
			companiesData = tenantsData.map(tenant => ({
				id: tenant.id,
				name: tenant.nombre
			}));
		}
		
		console.log('✅ Empresas procesadas:', companiesData);
		companies.set(companiesData);
		return companiesData;
		
	} catch (error) {
		console.error('❌ Error cargando empresas desde Supabase:', error);
		companies.set([]);
		const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
		throw new Error(`No se pudieron cargar las empresas: ${errorMessage}`);
	} finally {
		loading.set(false);
	}
}

/**
 * Cargar usuarios de una empresa específica desde Supabase
 * @param {string} tenantId - ID del tenant/empresa
 */
export async function loadCompanyUsers(tenantId) {
	loading.set(true);
	
	try {
		console.log('🔄 Cargando usuarios para empresa:', tenantId);
		
		const { data: users, error } = await supabase
			.from('users')
			.select('*')
			.eq('tenant_id', tenantId)
			.eq('activo', true)
			.order('nombre');
		
		if (error) {
			console.error('❌ Error cargando usuarios:', error);
			throw error;
		}
		
		console.log('✅ Usuarios obtenidos:', users);
		
		// Transformar a formato esperado
		const usersData = users.map(user => ({
			id: user.id,
			email: user.email,
			role: user.rol, // Nota: en tu CSV es 'rol', no 'role'
			full_name: user.nombre,
			tenant_id: user.tenant_id
		}));
		
		// Actualizar store
		companyUsers.update(current => ({
			...current,
			[tenantId]: usersData
		}));
		
		return usersData;
		
	} catch (error) {
		console.error('❌ Error cargando usuarios desde Supabase:', error);
		const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
		throw new Error(`No se pudieron cargar los usuarios: ${errorMessage}`);
	} finally {
		loading.set(false);
	}
}

/**
 * Obtener empresas (wrapper para compatibilidad)
 */
export async function getTestCompanies() {
	return await loadCompanies();
}

/**
 * Obtener usuarios de empresa (wrapper para compatibilidad)
 * @param {string} companyId - ID de la empresa
 */
export async function getCompanyUsers(companyId) {
	return await loadCompanyUsers(companyId);
}

/**
 * Login con empresa y usuario específicos
 * @param {string} companyId - ID de la empresa
 * @param {string} userEmail - Email del usuario
 * @param {string} password - Password del usuario
 */
export async function loginAs(companyId, userEmail, password = 'CrediSync2024!') {
	loading.set(true);
	
	try {
		console.log('🔐 Iniciando autenticación real con Supabase Auth...');
		
		// 1. Autenticación real con Supabase Auth
		const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
			email: userEmail,
			password: password
		});
		
		if (authError) {
			throw new Error(`Error de autenticación: ${authError.message}`);
		}
		
		console.log('✅ Autenticación exitosa con Supabase Auth:', authData.user.email);
		
		// 2. Obtener datos adicionales de nuestra tabla users
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('*')
			.eq('id', authData.user.id)
			.eq('activo', true)
			.single();
		
		if (userError || !userData) {
			throw new Error(`Usuario no encontrado en tabla users: ${userError?.message}`);
		}
		
		console.log('✅ Datos de usuario obtenidos:', userData);
		
		// Obtener nombre de la empresa desde Supabase
		let companyName = 'Empresa Desconocida';
		
		try {
			const { data: tenantData } = await supabase
				.from('tenants')
				.select('nombre')
				.eq('id', companyId)
				.single();
			
			if (tenantData) {
				companyName = tenantData.nombre;
			} else {
				// Fallback con nombres conocidos
				/** @type {Record<string, string>} */
				const knownNames = {
					'00000000-0000-0000-0000-000000000001': 'CrediSync',
					'11111111-1111-1111-1111-111111111111': 'Inversiones Paisa',
					'22222222-2222-2222-2222-222222222222': 'México'
				};
				companyName = knownNames[companyId] || `Empresa ${companyId.slice(0, 8)}`;
			}
		} catch (error) {
			console.warn('No se pudo obtener nombre de empresa:', error);
		}
		
		// Transformar a formato esperado
		const userFormatted = {
			id: userData.id,
			email: userData.email,
			user_metadata: {
				tenant_id: userData.tenant_id,
				tenant_name: companyName,
				role: userData.rol, // Nota: en tu CSV es 'rol'
				full_name: userData.nombre
			}
		};
	
		// Simular login exitoso
		user.set(userFormatted);
		
		// Persistir en localStorage para mantener sesión
		if (browser) {
			localStorage.setItem('credisync_session', JSON.stringify({
				companyId,
				userEmail,
				loginTime: Date.now()
			}));
		}
		
		console.log(`✅ Login exitoso: ${userFormatted.user_metadata.full_name} (${userFormatted.user_metadata.role}) - ${companyName}`);
		
		return userFormatted;
		
	} catch (error) {
		console.error('Error en login:', error);
		throw error;
	} finally {
		loading.set(false);
	}
}

/**
 * Logout
 */
export function logout() {
	user.set(null);
	
	if (browser) {
		localStorage.removeItem('credisync_session');
	}
	
	console.log('👋 Logout exitoso');
}

/**
 * Restaurar sesión desde localStorage
 */
export function restoreSession() {
	if (!browser) return false;
	
	try {
		const session = localStorage.getItem('credisync_session');
		if (!session) return false;
		
		const { companyId, userEmail, loginTime } = JSON.parse(session);
		
		// Verificar que la sesión no sea muy antigua (24 horas)
		const maxAge = 24 * 60 * 60 * 1000; // 24 horas
		if (Date.now() - loginTime > maxAge) {
			localStorage.removeItem('credisync_session');
			return false;
		}
		
		// Restaurar usuario de forma síncrona usando datos del localStorage
		// En lugar de hacer una llamada async a Supabase
		const userData = {
			id: `user-${companyId}-${userEmail}`,
			email: userEmail,
			user_metadata: {
				tenant_id: companyId,
				tenant_name: getCompanyName(companyId),
				role: 'admin', // Por defecto, se actualizará cuando se cargue desde Supabase
				full_name: userEmail.split('@')[0]
			}
		};
		
		user.set(userData);
		console.log('✅ Sesión restaurada:', userData.user_metadata.full_name);
		return true;
		
	} catch (error) {
		console.error('Error restaurando sesión:', error);
		if (browser) {
			localStorage.removeItem('credisync_session');
		}
		return false;
	}
}

/**
 * Obtener nombre de empresa por ID
 * @param {string} companyId - ID de la empresa
 */
function getCompanyName(companyId) {
	/** @type {Record<string, string>} */
	const companyNames = {
		'00000000-0000-0000-0000-000000000001': 'CrediSync',
		'11111111-1111-1111-1111-111111111111': 'Inversiones Paisa',
		'22222222-2222-2222-2222-222222222222': 'México'
	};
	return companyNames[companyId] || 'Empresa Desconocida';
}

/**
 * Cambiar de usuario sin logout completo (para testing)
 * @param {string} companyId - ID de la empresa
 * @param {string} userEmail - Email del usuario
 */
export function switchUser(companyId, userEmail) {
	return loginAs(companyId, userEmail);
}

/**
 * Obtener información del rol actual
 * @param {string} role - Rol del usuario
 */
export function getRoleInfo(role) {
	/** @type {Record<string, {name: string, description: string, permissions: string[], color: string}>} */
	const roleInfo = {
		cobrador: {
			name: 'Cobrador',
			description: 'Acceso solo a sus propios clientes y créditos',
			permissions: ['create_own', 'read_own', 'update_own'],
			color: 'blue'
		},
		user: {
			name: 'Usuario',
			description: 'Acceso solo a sus propios registros',
			permissions: ['create_own', 'read_own', 'update_own'],
			color: 'blue'
		},
		supervisor: {
			name: 'Supervisor',
			description: 'Acceso a sus registros y los de su equipo de cobradores',
			permissions: ['create_own', 'read_own', 'update_own', 'read_team', 'manage_team'],
			color: 'yellow'
		},
		manager: {
			name: 'Supervisor',
			description: 'Acceso a sus registros y los de su equipo',
			permissions: ['create_own', 'read_own', 'update_own', 'read_team'],
			color: 'yellow'
		},
		admin: {
			name: 'Administrador',
			description: 'Acceso completo a toda la empresa',
			permissions: ['create_any', 'read_any', 'update_any', 'delete_any', 'manage_users'],
			color: 'green'
		},
		superadmin: {
			name: 'Super Administrador',
			description: 'Acceso total al sistema multiempresa',
			permissions: ['*'],
			color: 'red'
		}
	};
	
	return roleInfo[role] || roleInfo.cobrador;
}