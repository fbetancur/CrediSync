<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';

	let connectionStatus = 'Probando conexión...';
	/** @type {Array<any>} */
	let users = [];
	/** @type {string | null} */
	let error = null;

	async function testConnection() {
		try {
			connectionStatus = '🔄 Conectando a Supabase...';
			
			// 1. Test de conexión básica
			const { data, error: connectionError } = await supabase
				.from('users')
				.select('count')
				.limit(1);
			
			if (connectionError) {
				throw new Error(`Error de conexión: ${connectionError.message}`);
			}
			
			connectionStatus = '✅ Conexión exitosa!';
			
			// 2. Obtener usuarios de la tabla users
			const { data: usersData, error: usersError } = await supabase
				.from('users')
				.select('*')
				.limit(10);
			
			if (usersError) {
				throw new Error(`Error obteniendo usuarios: ${usersError.message}`);
			}
			
			users = usersData || [];
			
			// 3. Verificar usuarios en auth.users (requiere service role)
			let authUsersCount = 'No disponible (requiere service role)';
			try {
				const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
				if (!authError && authUsers) {
					authUsersCount = `${authUsers.users.length} usuarios en auth.users`;
				}
			} catch (authErr) {
				console.log('Info: No se puede acceder a auth.users con anon key (normal)');
			}
			
			connectionStatus = `✅ Conexión exitosa! ${users.length} usuarios en tabla 'users', ${authUsersCount}`;
			
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error desconocido';
			connectionStatus = '❌ Error de conexión';
			console.error('Error:', err);
		}
	}

	onMount(testConnection);
</script>

<svelte:head>
	<title>Test Supabase - CrediSync</title>
</svelte:head>

<div class="page">
	<header>
		<h1>🧪 Test de Conexión Supabase</h1>
		<button on:click={testConnection}>Probar de Nuevo</button>
	</header>

	<div class="status-card">
		<h2>Estado de Conexión</h2>
		<p class="status">{connectionStatus}</p>
		
		{#if error}
			<div class="error">
				<strong>Error:</strong> {error}
			</div>
		{/if}
	</div>

	{#if users.length > 0}
		<div class="users-card">
			<h2>Usuarios Encontrados ({users.length})</h2>
			<div class="users-list">
				{#each users as user}
					<div class="user-item">
						<strong>{user.nombre}</strong>
						<span class="email">{user.email}</span>
						<span class="role">{user.rol}</span>
						<span class="tenant">Empresa: {user.tenant_id.slice(0, 8)}...</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="config-card">
		<h2>Configuración Actual</h2>
		<div class="config-item">
			<span>Supabase URL:</span>
			<code>{import.meta.env.PUBLIC_SUPABASE_URL || 'No configurada'}</code>
		</div>
		<div class="config-item">
			<span>Anon Key:</span>
			<code>{import.meta.env.PUBLIC_SUPABASE_ANON_KEY ? 'Configurada ✅' : 'No configurada ❌'}</code>
		</div>
	</div>

	<div class="instructions">
		<h3>📋 Instrucciones</h3>
		<ol>
			<li>Copia tu <strong>anon/public key</strong> de Supabase</li>
			<li>Pégala en el archivo <code>.env.local</code></li>
			<li>Reinicia el servidor de desarrollo</li>
			<li>Recarga esta página</li>
		</ol>
		
		<p><strong>Archivo .env.local debe contener:</strong></p>
		<pre><code>PUBLIC_SUPABASE_URL=https://hmnlriywocnpiktflehr.supabase.co
PUBLIC_SUPABASE_ANON_KEY=tu-clave-aqui</code></pre>
	</div>
</div>

<style>
	.page {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
	}

	header h1 {
		margin: 0;
		color: #1f2937;
	}

	header button {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
	}

	.status-card,
	.users-card,
	.config-card,
	.instructions {
		background: white;
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 20px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.status-card h2,
	.users-card h2,
	.config-card h2 {
		margin: 0 0 16px 0;
		color: #1f2937;
	}

	.status {
		font-size: 18px;
		font-weight: 500;
		padding: 12px;
		background: #f3f4f6;
		border-radius: 6px;
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fca5a5;
		color: #dc2626;
		padding: 12px;
		border-radius: 6px;
		margin-top: 12px;
	}

	.users-list {
		display: grid;
		gap: 12px;
	}

	.user-item {
		background: #f9fafb;
		padding: 12px;
		border-radius: 6px;
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		gap: 12px;
		align-items: center;
	}

	.user-item strong {
		color: #1f2937;
	}

	.email {
		color: #6b7280;
		font-size: 14px;
	}

	.role {
		background: #dbeafe;
		color: #1e40af;
		padding: 4px 8px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 600;
	}

	.tenant {
		color: #6b7280;
		font-size: 12px;
	}

	.config-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		padding: 8px 0;
		border-bottom: 1px solid #f3f4f6;
	}

	.config-item span {
		font-weight: 500;
		color: #374151;
	}

	code {
		background: #f3f4f6;
		padding: 4px 8px;
		border-radius: 4px;
		font-family: 'Courier New', monospace;
		font-size: 12px;
	}

	pre {
		background: #1f2937;
		color: #f9fafb;
		padding: 16px;
		border-radius: 6px;
		overflow-x: auto;
	}

	pre code {
		background: none;
		color: inherit;
		padding: 0;
	}

	.instructions h3 {
		margin: 0 0 16px 0;
		color: #1f2937;
	}

	.instructions ol {
		margin-bottom: 20px;
	}

	.instructions li {
		margin-bottom: 8px;
	}
</style>