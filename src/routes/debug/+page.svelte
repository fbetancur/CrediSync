<script>
	import { onMount } from 'svelte';
	import { currentUser, currentTenant, currentRole } from '$lib/stores/simple-auth.js';
	import { dataService } from '$lib/db/data-service.js';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	/** @type {any} */
	let stats = null;
	let loading = true;
	/** @type {string | null} */
	let error = null;

	async function loadStats() {
		loading = true;
		error = null;
		
		try {
			// Obtener estadísticas básicas
			const [clientes, productos, creditos] = await Promise.all([
				dataService.getClientes(),
				dataService.getProductosCredito(),
				dataService.getCreditos()
			]);
			
			stats = {
				user: {
					id: $currentUser.id,
					email: $currentUser.email,
					full_name: $currentUser.nombre,
					tenant_name: $currentTenant.nombre,
					tenant_id: $currentUser.tenant_id,
					role: $currentUser.rol
				},
				counts: {
					clientes: clientes.length,
					productos: productos.length,
					creditos: creditos.length
				},
				samples: {
					clientes: clientes.slice(0, 3),
					productos: productos.slice(0, 3),
					creditos: creditos.slice(0, 3)
				}
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error desconocido';
			console.error('Error loading stats:', err);
		} finally {
			loading = false;
		}
	}

	async function clearUserData() {
		if (!confirm('¿Estás seguro de que quieres limpiar TUS datos?')) return;
		
		try {
			await dataService.clearUserData();
			await loadStats();
			alert('Datos del usuario limpiados correctamente');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
			alert('Error limpiando datos: ' + errorMessage);
		}
	}

	async function clearAllData() {
		if (!confirm('¿Estás seguro de que quieres limpiar TODOS los datos de la empresa?')) return;
		
		try {
			await dataService.clearTenantData();
			await loadStats();
			alert('Todos los datos de la empresa limpiados correctamente');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
			alert('Error limpiando datos: ' + errorMessage);
		}
	}

	// Solo cargar stats cuando esté autenticado
	$: if ($currentUser && $currentTenant) {
		loadStats();
	}
</script>

<svelte:head>
	<title>Debug - CrediSync</title>
</svelte:head>

<div class="page">
	<header>
		<h1>🔧 Panel de Debug</h1>
		<button on:click={loadStats} disabled={loading}>
			{loading ? 'Cargando...' : 'Actualizar'}
		</button>
	</header>

	{#if error}
		<div class="error">
			<strong>Error:</strong> {error}
		</div>
	{/if}

	{#if stats}
		<!-- Información del Usuario -->
		<section class="debug-section">
			<h2>👤 Usuario Actual</h2>
			<div class="info-grid">
				<div class="info-item">
					<span class="info-label">ID:</span>
					<span class="mono">{stats.user.id}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Email:</span>
					<span>{stats.user.email}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Nombre:</span>
					<span>{stats.user.full_name}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Empresa:</span>
					<span>{stats.user.tenant_name}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Tenant ID:</span>
					<span class="mono">{stats.user.tenant_id}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Rol:</span>
					<span class="role-badge role-{stats.user.role}">{stats.user.role}</span>
				</div>
			</div>
		</section>

		<!-- Contadores -->
		<section class="debug-section">
			<h2>📊 Contadores (Filtrados por Rol)</h2>
			<div class="counters">
				<div class="counter">
					<span class="count">{stats.counts.clientes}</span>
					<span class="label">Clientes</span>
				</div>
				<div class="counter">
					<span class="count">{stats.counts.productos}</span>
					<span class="label">Productos</span>
				</div>
				<div class="counter">
					<span class="count">{stats.counts.creditos}</span>
					<span class="label">Créditos</span>
				</div>
			</div>
		</section>

		<!-- Muestras de Datos -->
		<section class="debug-section">
			<h2>🔍 Muestra de Datos</h2>
			
			{#if stats.samples.clientes.length > 0}
				<div class="sample-section">
					<h3>Clientes (primeros 3)</h3>
					{#each stats.samples.clientes as cliente}
						<div class="sample-item">
							<strong>{cliente.nombre}</strong>
							<small>Creado por: {cliente.created_by}</small>
						</div>
					{/each}
				</div>
			{/if}

			{#if stats.samples.productos.length > 0}
				<div class="sample-section">
					<h3>Productos (primeros 3)</h3>
					{#each stats.samples.productos as producto}
						<div class="sample-item">
							<strong>{producto.nombre}</strong>
							<small>Creado por: {producto.created_by}</small>
						</div>
					{/each}
				</div>
			{/if}

			{#if stats.samples.creditos.length > 0}
				<div class="sample-section">
					<h3>Créditos (primeros 3)</h3>
					{#each stats.samples.creditos as credito}
						<div class="sample-item">
							<strong>Monto: ${credito.monto}</strong>
							<small>Creado por: {credito.created_by}</small>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Herramientas -->
		<section class="debug-section">
			<h2>🛠️ Herramientas</h2>
			<div class="tools">
				<button class="tool-btn danger" on:click={clearUserData}>
					Limpiar Mis Datos
				</button>
				
				{#if stats.user.role === 'admin'}
					<button class="tool-btn danger" on:click={clearAllData}>
						Limpiar Todos los Datos de la Empresa
					</button>
				{/if}
			</div>
		</section>
	{/if}
</div>

<BottomMenu />

<style>
	.page {
		padding: 20px 20px 80px;
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

	header button:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fca5a5;
		color: #dc2626;
		padding: 16px;
		border-radius: 8px;
		margin-bottom: 24px;
	}

	.debug-section {
		background: white;
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 20px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.debug-section h2 {
		margin: 0 0 16px 0;
		color: #1f2937;
		font-size: 18px;
	}

	.debug-section h3 {
		margin: 16px 0 8px 0;
		color: #374151;
		font-size: 14px;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 12px;
	}

	.info-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		border-bottom: 1px solid #f3f4f6;
	}

	.info-label {
		font-weight: 500;
		color: #6b7280;
	}

	.mono {
		font-family: 'Courier New', monospace;
		font-size: 12px;
		background: #f3f4f6;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.role-badge {
		padding: 4px 8px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.role-cobrador { background: #dbeafe; color: #1e40af; }
	.role-admin { background: #dcfce7; color: #166534; }
	.role-supervisor { background: #fef3c7; color: #92400e; }

	.counters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 16px;
	}

	.counter {
		text-align: center;
		padding: 16px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.count {
		display: block;
		font-size: 24px;
		font-weight: 700;
		color: #1f2937;
	}

	.label {
		font-size: 12px;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.sample-section {
		margin-bottom: 20px;
	}

	.sample-item {
		background: #f9fafb;
		padding: 12px;
		border-radius: 6px;
		margin-bottom: 8px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.sample-item strong {
		color: #1f2937;
	}

	.sample-item small {
		color: #6b7280;
		font-size: 11px;
	}

	.tools {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.tool-btn {
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
	}

	.tool-btn.danger {
		background: #dc2626;
		color: white;
	}

	.tool-btn.danger:hover {
		background: #b91c1c;
	}
</style>