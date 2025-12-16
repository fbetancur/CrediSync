<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { dataService } from '$lib/db/data-service.js';
	import { isFullyLoaded, currentUser, currentTenant } from '$lib/stores/simple-auth.js';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	let clientes = $state([]);
	let clientesFiltrados = $state([]);
	let loading = $state(false);
	let searchTerm = $state('');

	async function loadClientes() {
		if (!$isFullyLoaded) return;
		
		loading = true;
		try {
			clientes = await dataService.getClientes();
			clientesFiltrados = clientes;
			console.log('✅ Clientes cargados:', clientes.length);
		} catch (error) {
			console.error('Error loading clientes:', error);
		} finally {
			loading = false;
		}
	}

	// Filtrar clientes cuando cambie el término de búsqueda
	$effect(() => {
		if (!searchTerm.trim()) {
			clientesFiltrados = clientes;
		} else {
			const term = searchTerm.toLowerCase();
			clientesFiltrados = clientes.filter(cliente => 
				cliente.nombre.toLowerCase().includes(term) ||
				cliente.numero_documento?.toLowerCase().includes(term) ||
				cliente.telefono?.includes(term)
			);
		}
	});

	// Solo cargar clientes cuando esté completamente autenticado
	$effect(() => {
		if ($isFullyLoaded) {
			loadClientes();
		}
	});

	async function eliminarCliente(id) {
		if (!confirm('¿Eliminar este cliente?')) return;
		
		try {
			await dataService.deleteCliente(id);
			console.log('✅ Cliente eliminado:', id);
			await loadClientes(); // Recargar la lista
		} catch (error) {
			console.error('❌ Error eliminando cliente:', error);
			alert('Error: ' + error.message);
		}
	}

	function verDetalleCliente(clienteId) {
		goto(`/clientes/${clienteId}`);
	}
</script>

<svelte:head>
	<title>Clientes - CrediSync</title>
</svelte:head>

<div class="clientes-page">
	<!-- Header -->
	<div class="header">
		<h1>Mis Clientes ({clientesFiltrados.length})</h1>
		<a href="/clientes/nuevo" class="btn-nuevo">+ Nuevo Cliente</a>
	</div>

	<!-- Buscador -->
	<div class="search-container">
		<div class="search-box">
			<input
				type="text"
				bind:value={searchTerm}
				placeholder="Buscar por nombre, documento o teléfono..."
				class="search-input"
			/>
			<span class="search-icon">🔍</span>
		</div>
	</div>

	<!-- Lista de Clientes -->
	{#if loading}
		<div class="loading-container">
			<div class="spinner"></div>
			<p>Cargando clientes...</p>
		</div>
	{:else if clientesFiltrados.length === 0}
		{#if searchTerm}
			<div class="empty-state">
				<div class="empty-icon">🔍</div>
				<h2>No se encontraron clientes</h2>
				<p>No hay clientes que coincidan con "{searchTerm}"</p>
				<button onclick={() => searchTerm = ''} class="btn-clear">
					Limpiar búsqueda
				</button>
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">👥</div>
				<h2>No hay clientes registrados</h2>
				<p>Agrega tu primer cliente para comenzar</p>
				<a href="/clientes/nuevo" class="btn-nuevo">
					Crear Primer Cliente
				</a>
			</div>
		{/if}
	{:else}
		<div class="clientes-list">
			{#each clientesFiltrados as cliente (cliente.id)}
				<div class="cliente-card" onclick={() => verDetalleCliente(cliente.id)}>
					<div class="cliente-info">
						<h3 class="cliente-nombre">{cliente.nombre}</h3>
						<div class="cliente-details">
							{#if cliente.tipo_documento && cliente.numero_documento}
								<div class="detail-item">
									<span class="detail-icon">📄</span>
									<span>{cliente.tipo_documento}: {cliente.numero_documento}</span>
								</div>
							{/if}
							{#if cliente.telefono}
								<div class="detail-item">
									<span class="detail-icon">📞</span>
									<a href="tel:{cliente.telefono}" onclick={(e) => e.stopPropagation()}>
										{cliente.telefono}
									</a>
								</div>
							{/if}
							{#if cliente.direccion}
								<div class="detail-item">
									<span class="detail-icon">📍</span>
									<span>{cliente.direccion}</span>
									{#if cliente.barrio}
										<span>, {cliente.barrio}</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
					<div class="cliente-actions">
						<button 
							class="btn-delete"
							onclick={(e) => { e.stopPropagation(); eliminarCliente(cliente.id); }}
							title="Eliminar cliente"
						>
							🗑️
						</button>
						<span class="chevron">▶</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<BottomMenu />

<style>
	.clientes-page {
		min-height: 100vh;
		background: #f8fafc;
		padding-bottom: 80px;
	}

	/* Header */
	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: linear-gradient(180deg, #eef2ff 0%, #ffffff 100%);
		border-bottom: 1px solid #c7d2fe;
		box-shadow: 0 2px 6px rgba(79, 70, 229, 0.1);
	}

	.header h1 {
		margin: 0;
		font-size: 1.375rem;
		color: #1e293b;
		font-weight: 700;
	}

	.btn-nuevo {
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
		font-size: 0.875rem;
	}

	.btn-nuevo:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
	}

	/* Buscador */
	.search-container {
		padding: 1rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.search-box {
		position: relative;
		max-width: 400px;
		margin: 0 auto;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 2.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		font-size: 1rem;
		background: #f8fafc;
		transition: all 0.2s;
		box-sizing: border-box;
	}

	.search-input:focus {
		outline: none;
		border-color: #4f46e5;
		background: white;
		box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: #94a3b8;
		font-size: 1.125rem;
	}

	/* Estados */
	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #e5e7eb;
		border-top: 4px solid #4f46e5;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		background: white;
		margin: 1rem;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
		opacity: 0.6;
	}

	.empty-state h2 {
		color: #1e293b;
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
	}

	.empty-state p {
		color: #64748b;
		margin: 0 0 1.5rem 0;
	}

	.btn-clear {
		padding: 0.75rem 1.5rem;
		background: #f1f5f9;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		color: #475569;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-clear:hover {
		background: #e2e8f0;
		border-color: #94a3b8;
	}

	/* Lista de Clientes */
	.clientes-list {
		padding: 1rem;
	}

	.cliente-card {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.cliente-card:hover {
		border-color: #c7d2fe;
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1);
		transform: translateY(-1px);
	}

	.cliente-info {
		flex: 1;
		min-width: 0;
	}

	.cliente-nombre {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #1e293b;
		line-height: 1.3;
	}

	.cliente-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #64748b;
		line-height: 1.4;
	}

	.detail-icon {
		font-size: 0.875rem;
		opacity: 0.7;
		flex-shrink: 0;
	}

	.detail-item a {
		color: #4f46e5;
		text-decoration: none;
		font-weight: 500;
	}

	.detail-item a:hover {
		text-decoration: underline;
	}

	.cliente-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-delete {
		background: none;
		border: none;
		color: #ef4444;
		font-size: 1.125rem;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 6px;
		transition: all 0.2s;
		opacity: 0.7;
	}

	.btn-delete:hover {
		background: #fef2f2;
		opacity: 1;
		transform: scale(1.1);
	}

	.chevron {
		color: #cbd5e1;
		font-size: 0.875rem;
		margin-left: 0.25rem;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.header {
			padding: 0.75rem;
		}

		.header h1 {
			font-size: 1.25rem;
		}

		.btn-nuevo {
			padding: 0.5rem 0.75rem;
			font-size: 0.8125rem;
		}

		.search-container {
			padding: 0.75rem;
		}

		.clientes-list {
			padding: 0.75rem;
		}

		.cliente-card {
			padding: 0.75rem;
		}

		.cliente-nombre {
			font-size: 1rem;
		}

		.detail-item {
			font-size: 0.8125rem;
		}
	}
</style>