/**
 * Script para sincronizar usuarios existentes con Supabase Auth
 * Ejecutar una sola vez para migrar usuarios de la tabla 'users' a 'auth.users'
 */

import { createClient } from '@supabase/supabase-js';

// Configuración (usar las mismas credenciales del .env.local)
const supabaseUrl = 'https://hmnlriywocnpiktflehr.supabase.co';
const supabaseServiceKey = 'TU_SERVICE_ROLE_KEY_AQUI'; // Necesitas la service role key

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

// Usuarios existentes de tu CSV
const existingUsers = [
	{
		id: '732219b5-c319-4e4d-ad65-222f2d5a69ef',
		email: 'admin@credisync.com',
		nombre: 'Admin CrediSync',
		tenant_id: '00000000-0000-0000-0000-000000000001',
		rol: 'admin'
	},
	{
		id: 'b9b9806a-eb97-4d4e-89e6-9ba7d388a6d5',
		email: 'admin@inversionespaisa.com',
		nombre: 'Admin Inversiones Paisa',
		tenant_id: '11111111-1111-1111-1111-111111111111',
		rol: 'admin'
	},
	{
		id: 'de774ddd-0b38-452a-b75d-5e9ea2c8d6df',
		email: 'cobrador1@inversionespaisa.com',
		nombre: 'Cobrador 1 Paisa',
		tenant_id: '11111111-1111-1111-1111-111111111111',
		rol: 'cobrador'
	},
	{
		id: '2201d2ca-3371-427a-94db-d0b1b3a43edb',
		email: 'cobrador2@inversionespaisa.com',
		nombre: 'Cobrador 2 Paisa',
		tenant_id: '11111111-1111-1111-1111-111111111111',
		rol: 'cobrador'
	},
	{
		id: '68665164-4827-4c9f-b6e3-97ed3f9c1984',
		email: 'admin@mexico.com',
		nombre: 'Admin México',
		tenant_id: '22222222-2222-2222-2222-222222222222',
		rol: 'admin'
	},
	{
		id: '2eb7406c-dd6a-4f0b-b7d6-25b5e888a57a',
		email: 'cobrador1@mexico.com',
		nombre: 'Cobrador 1 México',
		tenant_id: '22222222-2222-2222-2222-222222222222',
		rol: 'cobrador'
	},
	{
		id: 'd2cb3d9d-57e7-48db-9126-c81eaef88069',
		email: 'cobrador2@mexico.com',
		nombre: 'Cobrador 2 México',
		tenant_id: '22222222-2222-2222-2222-222222222222',
		rol: 'cobrador'
	}
];

async function syncUsersToAuth() {
	console.log('🔄 Sincronizando usuarios con Supabase Auth...');

	for (const user of existingUsers) {
		try {
			console.log(`\n📝 Procesando: ${user.email}`);

			// 1. Crear usuario en auth.users con el mismo UUID
			const { data: authData, error: authError } = await supabase.auth.admin.createUser({
				user_id: user.id, // Usar el UUID existente
				email: user.email,
				password: 'CrediSync2024!', // Password temporal para todos
				email_confirm: true, // Confirmar email automáticamente
				user_metadata: {
					tenant_id: user.tenant_id,
					role: user.rol,
					full_name: user.nombre
				}
			});

			if (authError) {
				if (authError.message.includes('already registered')) {
					console.log(`⚠️  Usuario ya existe en auth: ${user.email}`);
				} else {
					throw authError;
				}
			} else {
				console.log(`✅ Usuario creado en auth: ${user.email}`);
			}

			// 2. Verificar que el usuario existe en la tabla users
			const { data: existingUser, error: checkError } = await supabase
				.from('users')
				.select('id')
				.eq('id', user.id)
				.single();

			if (checkError && checkError.code === 'PGRST116') {
				// Usuario no existe en tabla, crearlo
				const { error: insertError } = await supabase
					.from('users')
					.insert({
						id: user.id,
						tenant_id: user.tenant_id,
						email: user.email,
						nombre: user.nombre,
						rol: user.rol,
						activo: true
					});

				if (insertError) throw insertError;
				console.log(`✅ Usuario creado en tabla users: ${user.email}`);
			} else {
				console.log(`✅ Usuario ya existe en tabla users: ${user.email}`);
			}

		} catch (error) {
			console.error(`❌ Error procesando ${user.email}:`, error.message);
		}
	}

	console.log('\n🎉 Sincronización completada!');
	console.log('\n📋 Credenciales de acceso:');
	console.log('Email: cualquier email de la lista');
	console.log('Password: CrediSync2024!');
}

// Ejecutar solo si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
	syncUsersToAuth().catch(console.error);
}

export { syncUsersToAuth };