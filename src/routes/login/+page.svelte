<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { 
		loadCompanies,
		loadCompanyUsers, 
		loginAs, 
		getRoleInfo,
		isAuthenticated,
		loading as authLoading
	} from '$lib/stores/optimized-auth.js';

	let selectedCompany = '';
	let selectedUser = '';
	let password = 'CrediSync2024!'; // Password por defecto
	/** @type {Array<{id: string, name: string}>} */
	let companies = [];
	/** @type {Array<{id: string, email: string, role: string, full_name: string, tenant_id: string}>} */
	let users = [];
	let localLoading = false;
	let error = '';

	// Redirigir si ya está autenticado
	$: if ($isAuthenticated) {
		goto('/');
	}

	onMount(async () => {
		try {
			companies = await loadCompanies();
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
			error = `Error cargando empresas: ${errorMessage}`;
			console.error('Error:', err);
		}
	});

	async function onCompanyChange() {
		selectedUser = '';
		error = '';
		
		if (!selectedCompany) {
			users = [];
			return;
		}
		
		try {
			users = await loadCompanyUsers(selectedCompany);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
			error = `Error cargando usuarios: ${errorMessage}`;
			users = [];
			console.error('Error:', err);
		}
	}

	async function handleLogin() {
		if (!selectedCompany || !selectedUser) {
			error = 'Selecciona empresa y usuario';
			return;
		}

		localLoading = true;
		error = '';

		try {
			await loginAs(selectedCompany, selectedUser, password);
			goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error de autenticación';
		} finally {
			localLoading = false;
		}
	}

	/**
	 * @param {string} role
	 */
	function getRoleBadgeClass(role) {
		/** @type {Record<string, string>} */
		const classes = {
			user: 'badge-user',
			manager: 'badge-manager', 
			admin: 'badge-admin',
			superadmin: 'badge-superadmin'
		};
		return classes[role] || 'badge-user';
	}
</script>

<svelte:head>
	<title>Login - CrediSync</title>
</svelte:head>

<div class="login-container">
	<div class="login-card">
		<div class="header">
			<h1>CrediSync</h1>
			<p>Sistema de Testing Manual</p>
		</div>

		<form on:submit|preventDefault={handleLogin} class="login-form">
			<!-- Selector de Empresa -->
			<div class="field">
				<label for="company">Empresa</label>
				<select 
					id="company" 
					bind:value={selectedCompany} 
					on:change={onCompanyChange}
					required
				>
					<option value="">Seleccionar empresa...</option>
					{#each companies as company}
						<option value={company.id}>{company.name}</option>
					{/each}
				</select>
			</div>

			<!-- Selector de Usuario -->
			<div class="field">
				<label for="user">Usuario</label>
				<select 
					id="user" 
					bind:value={selectedUser} 
					disabled={!selectedCompany}
					required
				>
					<option value="">Seleccionar usuario...</option>
					{#each users as user}
						<option value={user.email}>
							{user.full_name} ({user.email})
						</option>
					{/each}
				</select>
			</div>

			<!-- Campo de Password -->
			<div class="field">
				<label for="password">Password</label>
				<input 
					id="password" 
					type="password"
					bind:value={password} 
					placeholder="Password de Supabase Auth"
					required
				>
			</div>

			<!-- Información del Rol -->
			{#if selectedUser}
				{@const userInfo = users.find(u => u.email === selectedUser)}
				{#if userInfo}
					{@const roleInfo = getRoleInfo(userInfo.role)}
					<div class="role-info">
						<div class="role-badge {getRoleBadgeClass(userInfo.role)}">
							{roleInfo.name}
						</div>
						<p class="role-description">{roleInfo.description}</p>
					</div>
				{/if}
			{/if}

			<!-- Error -->
			{#if error}
				<div class="error">
					{error}
				</div>
			{/if}

			<!-- Botón de Login -->
			<button 
				type="submit" 
				disabled={$authLoading || localLoading || !selectedCompany || !selectedUser}
				class="login-btn"
			>
				{$authLoading || localLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
			</button>
		</form>

		<!-- Información de Testing -->
		<div class="testing-info">
			<h3>🧪 Modo Testing</h3>
			<p>Esta es una versión de prueba con datos simulados para validar:</p>
			<ul>
				<li>Separación por empresa (multiempresa)</li>
				<li>Filtrado por roles y permisos</li>
				<li>Persistencia en IndexedDB</li>
				<li>Cambio de contexto de usuario</li>
			</ul>
		</div>
	</div>
</div>

<style>
	.login-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 20px;
	}

	.login-card {
		background: white;
		border-radius: 12px;
		padding: 32px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
		width: 100%;
		max-width: 400px;
	}

	.header {
		text-align: center;
		margin-bottom: 32px;
	}

	.header h1 {
		color: #1f2937;
		margin: 0 0 8px 0;
		font-size: 28px;
		font-weight: 700;
	}

	.header p {
		color: #6b7280;
		margin: 0;
		font-size: 14px;
	}

	.login-form {
		margin-bottom: 24px;
	}

	.field {
		margin-bottom: 20px;
	}

	.field label {
		display: block;
		margin-bottom: 6px;
		font-weight: 500;
		color: #374151;
		font-size: 14px;
	}

	.field select {
		width: 100%;
		padding: 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 16px;
		background: white;
		box-sizing: border-box;
	}

	.field select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.field select:disabled {
		background: #f9fafb;
		color: #9ca3af;
	}

	.role-info {
		background: #f0f9ff;
		border: 1px solid #0ea5e9;
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 20px;
	}

	.role-badge {
		display: inline-block;
		padding: 4px 12px;
		border-radius: 20px;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		margin-bottom: 8px;
	}

	.badge-user { background: #dbeafe; color: #1e40af; }
	.badge-manager { background: #fef3c7; color: #92400e; }
	.badge-admin { background: #dcfce7; color: #166534; }
	.badge-superadmin { background: #fce7f3; color: #be185d; }

	.role-description {
		margin: 0;
		font-size: 14px;
		color: #0369a1;
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fca5a5;
		color: #dc2626;
		padding: 12px;
		border-radius: 8px;
		margin-bottom: 20px;
		font-size: 14px;
	}

	.login-btn {
		width: 100%;
		background: #3b82f6;
		color: white;
		border: none;
		padding: 14px;
		border-radius: 8px;
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.login-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.login-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.testing-info {
		border-top: 1px solid #e5e7eb;
		padding-top: 24px;
	}

	.testing-info h3 {
		margin: 0 0 12px 0;
		color: #374151;
		font-size: 16px;
	}

	.testing-info p {
		margin: 0 0 12px 0;
		color: #6b7280;
		font-size: 14px;
	}

	.testing-info ul {
		margin: 0;
		padding-left: 20px;
		color: #6b7280;
		font-size: 14px;
	}

	.testing-info li {
		margin-bottom: 4px;
	}
</style>