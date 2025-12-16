<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { user, auth, isFullyLoaded } from '$lib/stores/simple-auth.js';

	let email = '';
	let password = '';
	let showPassword = false;
	let loading = false;
	let error = '';

	// Redirigir solo cuando esté completamente cargado
	$: if ($isFullyLoaded) {
		console.log('✅ Usuario completamente autenticado, redirigiendo...');
		goto('/');
	}

	async function handleLogin() {
		if (!email || !password) {
			return;
		}

		loading = true;
		error = '';

		console.log('🔐 Intentando login con:', email);
		const { error: authError } = await auth.signIn(email, password);

		loading = false;

		if (authError) {
			error = authError.message;
			console.error('❌ Error en login:', authError);
		} else {
			console.log('✅ Login exitoso, redirigiendo...');
			goto('/');
		}
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleLogin();
		}
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
			<!-- Campo de Email -->
			<div class="field">
				<label for="email">Email</label>
				<input 
					id="email" 
					type="email"
					bind:value={email} 
					placeholder="tu@email.com"
					on:keypress={handleKeyPress}
					required
					autocomplete="email"
				>
			</div>

			<!-- Campo de Password -->
			<div class="field">
				<label for="password">Contraseña</label>
				<div class="password-field">
					<input 
						id="password" 
						type={showPassword ? 'text' : 'password'}
						bind:value={password} 
						placeholder="Tu contraseña"
						on:keypress={handleKeyPress}
						required
						autocomplete="current-password"
					>
					<button 
						type="button" 
						class="password-toggle"
						on:click={() => showPassword = !showPassword}
					>
						{showPassword ? '👁️' : '👁️‍🗨️'}
					</button>
				</div>
			</div>

			<!-- Error -->
			{#if error}
				<div class="error">
					{error}
				</div>
			{/if}

			<!-- Botón de Login -->
			<button 
				type="submit" 
				disabled={loading || !email || !password}
				class="login-btn"
			>
				{loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
			</button>
		</form>

		<!-- Información del Sistema -->
		<div class="system-info">
			<h3>🏢 Sistema Multi-Tenant</h3>
			<p>Ingresa con tu email y contraseña. El sistema detectará automáticamente tu empresa y permisos.</p>
			
			{#if $user && !$isFullyLoaded}
				<div class="loading-session">
					<p>🔄 Cargando datos de la empresa...</p>
				</div>
			{:else if $isFullyLoaded}
				<div class="current-session">
					<p><strong>Redirigiendo...</strong></p>
				</div>
			{/if}
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

	.field input {
		width: 100%;
		padding: 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 16px;
		background: white;
		box-sizing: border-box;
	}

	.field input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.password-field {
		position: relative;
	}

	.password-toggle {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		font-size: 16px;
		padding: 0;
		color: #6b7280;
	}

	.password-toggle:hover {
		color: #374151;
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

	.system-info {
		border-top: 1px solid #e5e7eb;
		padding-top: 24px;
	}

	.system-info h3 {
		margin: 0 0 12px 0;
		color: #374151;
		font-size: 16px;
	}

	.system-info p {
		margin: 0 0 12px 0;
		color: #6b7280;
		font-size: 14px;
	}

	.current-session {
		background: #f0f9ff;
		border: 1px solid #0ea5e9;
		border-radius: 8px;
		padding: 12px;
		margin-top: 16px;
	}

	.current-session p {
		margin: 4px 0;
		color: #0369a1;
		font-size: 14px;
	}

	.loading-session {
		background: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 8px;
		padding: 12px;
		margin-top: 16px;
	}

	.loading-session p {
		margin: 4px 0;
		color: #92400e;
		font-size: 14px;
	}
</style>