/**
 * Configuración de autenticación real con Supabase Auth
 * Este archivo contiene funciones para sincronizar usuarios entre auth.users y nuestra tabla users
 */

import { supabase } from '../supabase.js';

/**
 * Tipos para los datos de usuario
 * @typedef {Object} UserData
 * @property {string} email
 * @property {string} [password]
 * @property {string} tenant_id
 * @property {string} rol
 * @property {string} nombre
 */

/**
 * Registrar usuario en Supabase Auth y en nuestra tabla users
 * @param {UserData} userData - Datos del usuario a registrar
 */
export async function registerUser(userData) {
	try {
		// 1. Crear usuario en Supabase Auth
		const { data: authData, error: authError } = await supabase.auth.signUp({
			email: userData.email,
			password: userData.password || 'temp123456', // Password temporal
			options: {
				data: {
					tenant_id: userData.tenant_id,
					role: userData.rol,
					full_name: userData.nombre
				}
			}
		});

		if (authError) throw authError;
		if (!authData.user) throw new Error('No se pudo crear el usuario');

		// 2. Insertar en nuestra tabla users con el UUID de auth
		const { data: userRecord, error: userError } = await supabase
			.from('users')
			.insert({
				id: authData.user.id, // Usar el UUID de auth.users
				tenant_id: userData.tenant_id,
				email: userData.email,
				nombre: userData.nombre,
				rol: userData.rol,
				activo: true
			})
			.select()
			.single();

		if (userError) throw userError;

		console.log('✅ Usuario registrado exitosamente:', userRecord);
		return userRecord;

	} catch (error) {
		console.error('❌ Error registrando usuario:', error);
		throw error;
	}
}

/**
 * Login multi-tenant con detección automática de empresa
 * @param {string} email - Email del usuario
 * @param {string} password - Password del usuario
 */
export async function loginWithSupabaseAuth(email, password) {
	try {
		console.log('🔐 Autenticando con Supabase Auth...');

		// 1. Autenticar con Supabase Auth
		const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (authError) {
			// No revelar información específica del tenant en errores
			throw new Error('Credenciales inválidas');
		}

		console.log('🔍 Auth exitoso, obteniendo datos del usuario...');
		console.log('🔍 User ID de Supabase Auth:', authData.user.id);
		
		// Primero verificar si el usuario existe en nuestra tabla
		const { data: userCheck, error: checkError } = await supabase
			.from('users')
			.select('*')
			.eq('id', authData.user.id)
			.single();
			
		console.log('🔍 Verificación usuario:', { userCheck, checkError });
		
		if (checkError || !userCheck) {
			throw new Error('Usuario no encontrado en la base de datos. Contacta al administrador.');
		}
		
		// 2. Obtener datos del tenant
		const { data: tenantData, error: tenantError } = await supabase
			.from('tenants')
			.select('*')
			.eq('id', userCheck.tenant_id)
			.eq('activo', true)
			.single();
			
		console.log('🔍 Resultado consulta tenant:', { tenantData, tenantError });
		
		if (tenantError || !tenantData) {
			throw new Error('Empresa no encontrada o inactiva');
		}
		
		const userData = {
			...userCheck,
			tenants: tenantData
		};

		if (userError || !userData) {
			console.error('❌ Usuario no encontrado o inactivo:', userError);
			throw new Error('Usuario no autorizado');
		}

		// 3. Obtener rol del usuario
		console.log('🔍 Obteniendo rol del usuario...');
		const { data: roleData, error: roleError } = await supabase
			.from('roles')
			.select('id, nombre, permisos, es_admin')
			.eq('tenant_id', userData.tenant_id)
			.eq('nombre', userData.rol)
			.single();
			
		console.log('🔍 Resultado consulta rol:', { roleData, roleError });

		if (roleError || !roleData) {
			console.error('❌ Rol no encontrado:', roleError);
			throw new Error('Rol no configurado');
		}

		// 4. Verificar que el tenant esté activo
		if (!userData.tenants.activo) {
			throw new Error('Empresa temporalmente suspendida');
		}

		// 5. Actualizar JWT con información del tenant y rol
		const { error: updateError } = await supabase.auth.updateUser({
			data: {
				tenant_id: userData.tenant_id,
				tenant_name: userData.tenants.nombre,
				role_id: roleData.id,
				role_name: roleData.nombre,
				is_admin: roleData.es_admin,
				permissions: roleData.permisos
			}
		});

		if (updateError) {
			console.warn('⚠️ No se pudo actualizar JWT:', updateError);
		}

		console.log('✅ Login exitoso:', {
			user: userData.nombre,
			tenant: userData.tenants.nombre,
			role: roleData.nombre
		});

		return {
			authUser: authData.user,
			userData: userData,
			tenantData: userData.tenants,
			roleData: roleData
		};

	} catch (error) {
		console.error('❌ Error en login:', error);
		throw error;
	}
}

/**
 * Logout con Supabase Auth
 */
export async function logoutFromSupabase() {
	try {
		const { error } = await supabase.auth.signOut();
		if (error) throw error;
		
		console.log('✅ Logout exitoso');
		return true;
	} catch (error) {
		console.error('❌ Error en logout:', error);
		throw error;
	}
}

/**
 * Obtener sesión actual con contexto multi-tenant
 */
export async function getCurrentSession() {
	try {
		const { data: { session }, error } = await supabase.auth.getSession();
		
		if (error) throw error;
		
		if (session) {
			// Obtener datos del usuario
			const { data: userData, error: userError } = await supabase
				.from('users')
				.select(`
					*,
					tenants!inner(id, nombre, activo)
				`)
				.eq('id', session.user.id)
				.eq('activo', true)
				.eq('tenants.activo', true)
				.single();

			if (userError || !userData) {
				console.warn('⚠️ Usuario no encontrado en sesión actual');
				return null;
			}

			// Obtener rol del usuario
			const { data: roleData, error: roleError } = await supabase
				.from('roles')
				.select('id, nombre, permisos, es_admin')
				.eq('tenant_id', userData.tenant_id)
				.eq('nombre', userData.rol)
				.single();

			if (roleError || !roleData) {
				console.warn('⚠️ Rol no encontrado en sesión actual');
				return null;
			}

			return {
				authUser: session.user,
				userData: userData,
				tenantData: userData.tenants,
				roleData: roleData
			};
		}

		return null;
	} catch (error) {
		console.error('❌ Error obteniendo sesión:', error);
		return null;
	}
}

/**
 * Escuchar cambios de autenticación con contexto multi-tenant
 * @param {Function} callback - Función callback para manejar cambios de estado
 */
export function onAuthStateChange(callback) {
	return supabase.auth.onAuthStateChange(async (event, session) => {
		console.log('🔄 Auth state changed:', event);
		
		if (session) {
			// Obtener datos completos del usuario
			try {
				const { data: userData } = await supabase
					.from('users')
					.select(`
						*,
						tenants!inner(id, nombre, activo)
					`)
					.eq('id', session.user.id)
					.eq('activo', true)
					.eq('tenants.activo', true)
					.single();

				if (userData) {
					// Obtener rol del usuario
					const { data: roleData } = await supabase
						.from('roles')
						.select('id, nombre, permisos, es_admin')
						.eq('tenant_id', userData.tenant_id)
						.eq('nombre', userData.rol)
						.single();

					if (roleData) {
						callback(event, {
							authUser: session.user,
							userData: userData,
							tenantData: userData.tenants,
							roleData: roleData
						});
					} else {
						callback(event, null);
					}
				} else {
					callback(event, null);
				}
			} catch (error) {
				console.error('Error obteniendo datos de usuario:', error);
				callback(event, null);
			}
		} else {
			callback(event, null);
		}
	});
}