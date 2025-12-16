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
 * Login real con Supabase Auth
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

		if (authError) throw authError;

		// 2. Obtener datos adicionales de nuestra tabla users
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('*')
			.eq('id', authData.user.id)
			.eq('activo', true)
			.single();

		if (userError) throw userError;

		console.log('✅ Login exitoso:', userData);
		return {
			authUser: authData.user,
			userData: userData
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
 * Obtener sesión actual de Supabase Auth
 */
export async function getCurrentSession() {
	try {
		const { data: { session }, error } = await supabase.auth.getSession();
		
		if (error) throw error;
		
		if (session) {
			// Obtener datos adicionales de nuestra tabla
			const { data: userData, error: userError } = await supabase
				.from('users')
				.select('*')
				.eq('id', session.user.id)
				.eq('activo', true)
				.single();

			if (userError) throw userError;

			return {
				authUser: session.user,
				userData: userData
			};
		}

		return null;
	} catch (error) {
		console.error('❌ Error obteniendo sesión:', error);
		return null;
	}
}

/**
 * Escuchar cambios de autenticación
 * @param {Function} callback - Función callback para manejar cambios de estado
 */
export function onAuthStateChange(callback) {
	return supabase.auth.onAuthStateChange(async (event, session) => {
		console.log('🔄 Auth state changed:', event);
		
		if (session) {
			// Obtener datos del usuario
			try {
				const { data: userData } = await supabase
					.from('users')
					.select('*')
					.eq('id', session.user.id)
					.eq('activo', true)
					.single();

				callback(event, {
					authUser: session.user,
					userData: userData
				});
			} catch (error) {
				console.error('Error obteniendo datos de usuario:', error);
				callback(event, null);
			}
		} else {
			callback(event, null);
		}
	});
}