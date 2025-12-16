import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/supabase.js';
import { syncProductosToSupabase } from '$lib/sync/productos.js';

// Store básico de Supabase Auth (como el ejemplo)
export const user = writable(null);

// Store para datos multi-tenant (se carga después del login)
export const tenantData = writable(null);

// Stores derivados para fácil acceso
export const isAuthenticated = derived(user, $user => !!$user);

export const currentUser = derived(tenantData, $tenantData => $tenantData?.user || null);

export const currentTenant = derived(tenantData, $tenantData => $tenantData?.tenant || null);

export const currentRole = derived(tenantData, $tenantData => $tenantData?.role || null);

export const isAdmin = derived(tenantData, $tenantData => $tenantData?.role?.es_admin || false);

// Store para verificar si los datos multi-tenant están cargados
export const isFullyLoaded = derived(
	[user, tenantData], 
	([$user, $tenantData]) => !!$user && !!$tenantData
);

// Inicializar sesión con manejo de errores
supabase.auth.getSession().then(({ data, error }) => {
	if (error) {
		console.error('❌ Error obteniendo sesión:', error);
		// Limpiar storage corrupto
		if (error.message?.includes('Invalid Refresh Token') || error.message?.includes('refresh_token')) {
			console.log('🧹 Limpiando tokens corruptos');
			localStorage.clear();
			sessionStorage.clear();
		}
		user.set(null);
		return;
	}
	
	user.set(data.session?.user ?? null);
	if (data.session?.user) {
		loadTenantData(data.session.user.id);
	}
}).catch(error => {
	console.error('❌ Error crítico en getSession:', error);
	user.set(null);
});

// Escuchar cambios de autenticación con manejo de errores
supabase.auth.onAuthStateChange((event, session) => {
	console.log('🔄 Auth state change:', event);
	
	if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
		if (event === 'SIGNED_OUT') {
			tenantData.set(null);
		}
	}
	
	user.set(session?.user ?? null);
	if (session?.user) {
		loadTenantData(session.user.id);
	} else {
		tenantData.set(null);
	}
});

// Cargar datos multi-tenant (sin bloquear el login)
async function loadTenantData(userId) {
	try {
		console.log('🔍 Cargando datos multi-tenant para usuario:', userId);
		
		// 1. Verificar que el usuario existe y está activo (RLS aplicado automáticamente)
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id, tenant_id, email, nombre, rol, activo')
			.eq('id', userId)
			.eq('activo', true)
			.single();

		if (userError || !userData) {
			console.error('❌ Usuario no encontrado o inactivo:', userError);
			// Forzar logout si el usuario no es válido
			await auth.signOut();
			return;
		}

		// 2. Verificar que el tenant existe y está activo
		const { data: tenant, error: tenantError } = await supabase
			.from('tenants')
			.select('id, nombre, activo')
			.eq('id', userData.tenant_id)
			.eq('activo', true)
			.single();

		if (tenantError || !tenant) {
			console.error('❌ Tenant no encontrado o inactivo:', tenantError);
			// Forzar logout si el tenant no es válido
			await auth.signOut();
			return;
		}

		// 3. Obtener rol y permisos
		console.log('🔍 Buscando rol:', userData.rol, 'en tenant:', userData.tenant_id);
		const { data: roleData, error: roleError } = await supabase
			.from('roles')
			.select('id, nombre, permisos, es_admin, scope')
			.eq('tenant_id', userData.tenant_id)
			.eq('nombre', userData.rol)
			.single();

		if (roleError || !roleData) {
			console.warn('⚠️ Rol no encontrado, usando permisos básicos. Error:', roleError);
		} else {
			console.log('✅ Rol encontrado:', roleData);
		}

		// 4. Establecer datos seguros
		const finalData = {
			user: {
				id: userData.id,
				email: userData.email,
				nombre: userData.nombre,
				rol: userData.rol,
				tenant_id: userData.tenant_id
			},
			tenant: {
				id: tenant.id,
				nombre: tenant.nombre
			},
			role: roleData || { nombre: userData.rol, permisos: {}, es_admin: false }
		};
		
		tenantData.set(finalData);
		console.log('✅ Datos multi-tenant cargados correctamente:', finalData);

		// 5. Iniciar sincronización automática para offline-first
		console.log('🔄 Iniciando sincronización automática...');
		try {
			await syncProductosToSupabase();
			console.log('✅ Sincronización inicial completada');
		} catch (syncError) {
			console.warn('⚠️ Error en sincronización inicial (continuando):', syncError);
		}

	} catch (error) {
		console.error('❌ Error crítico cargando datos multi-tenant:', error);
		// En caso de error crítico, forzar logout por seguridad
		await auth.signOut();
	}
}

// Funciones de auth (simples como el ejemplo)
export const auth = {
	async signIn(email, password) {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password
		});
		return { data, error };
	},

	async signOut() {
		const { error } = await supabase.auth.signOut();
		tenantData.set(null);
		// Limpiar storage local también
		localStorage.clear();
		sessionStorage.clear();
		return { error };
	},

	// Función para limpiar estado corrupto
	clearCorruptedState() {
		console.log('🧹 Limpiando estado corrupto de autenticación');
		user.set(null);
		tenantData.set(null);
		localStorage.clear();
		sessionStorage.clear();
		// Recargar la página para reinicializar
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	}
};