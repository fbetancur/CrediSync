<script>
	import { onMount } from 'svelte';
	import { dataService } from '$lib/db/data-service.js';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	/** @type {Array<any>} */
	let clientes = [];

	async function loadClientes() {
		try {
			clientes = await dataService.getClientes();
		} catch (error) {
			console.error('Error loading clientes:', error);
		}
	}

	onMount(loadClientes);
</script>

<div class="page">
	<header>
		<h1>Clientes</h1>
		<a href="/nuevo-cliente" class="btn-primary">Nuevo Cliente</a>
	</header>

	<div class="clientes">
		{#each clientes as cliente}
			<div class="cliente-card">
				<h3>{cliente.nombre}</h3>
				<p>Documento: {cliente.documento}</p>
				<p>Teléfono: {cliente.telefono}</p>
				{#if cliente.email}
					<p>Email: {cliente.email}</p>
				{/if}
				<small>Creado: {new Date(cliente.created_at).toLocaleDateString()}</small>
			</div>
		{:else}
			<div class="empty-state">
				<p>No hay clientes registrados</p>
				<a href="/nuevo-cliente">Crear primer cliente</a>
			</div>
		{/each}
	</div>
</div>

<BottomMenu />

<style>
	.page { 
		padding: 20px 20px 80px; 
	}
	
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}
	
	header h1 {
		margin: 0;
		color: #1f2937;
	}
	
	.btn-primary {
		background: #3b82f6;
		color: white;
		text-decoration: none;
		padding: 10px 16px;
		border-radius: 6px;
	}
	
	.cliente-card { 
		background: white; 
		padding: 16px; 
		border-radius: 8px; 
		margin: 12px 0; 
		box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
	}
	
	.cliente-card h3 {
		margin: 0 0 12px 0;
		color: #1f2937;
	}
	
	.cliente-card p {
		margin: 4px 0;
		color: #4b5563;
	}
	
	.cliente-card small {
		color: #6b7280;
	}
	
	.empty-state {
		text-align: center;
		padding: 40px 20px;
		color: #6b7280;
	}
	
	.empty-state a {
		color: #3b82f6;
		text-decoration: none;
	}
</style>