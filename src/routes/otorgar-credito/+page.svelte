<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { dataService } from '$lib/db/data-service.js';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	let clientes = [];
	let productos = [];
	let loading = false;

	let credito = {
		cliente_id: '',
		producto_id: '',
		monto: '',
		observaciones: ''
	};

	let selectedProducto = null;

	async function loadData() {
		try {
			[clientes, productos] = await Promise.all([
				dataService.getClientes(),
				dataService.getProductosCredito()
			]);
		} catch (error) {
			console.error('Error loading data:', error);
		}
	}

	function onProductoChange() {
		selectedProducto = productos.find(p => p.id === credito.producto_id);
	}

	async function otorgarCredito() {
		if (loading) return;
		
		loading = true;
		try {
			await dataService.createCredito(credito);
			goto('/clientes');
		} catch (error) {
			console.error('Error otorgando crédito:', error);
			alert('Error al otorgar crédito');
		} finally {
			loading = false;
		}
	}

	onMount(loadData);
</script>

<div class="page">
	<header>
		<h1>Otorgar Crédito</h1>
		<a href="/clientes" class="btn-secondary">Cancelar</a>
	</header>

	<form on:submit|preventDefault={otorgarCredito} class="form">
		<div class="field">
			<label for="cliente">Cliente *</label>
			<select id="cliente" bind:value={credito.cliente_id} required>
				<option value="">Seleccionar cliente</option>
				{#each clientes as cliente}
					<option value={cliente.id}>{cliente.nombre} - {cliente.documento}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="producto">Producto de Crédito *</label>
			<select 
				id="producto" 
				bind:value={credito.producto_id} 
				on:change={onProductoChange}
				required
			>
				<option value="">Seleccionar producto</option>
				{#each productos as producto}
					<option value={producto.id}>{producto.nombre}</option>
				{/each}
			</select>
		</div>

		{#if selectedProducto}
			<div class="producto-info">
				<h3>Información del Producto</h3>
				<p>Interés: {selectedProducto.interes_porcentaje}%</p>
				<p>Plazo: {selectedProducto.plazo_dias} días</p>
				<p>Rango: ${selectedProducto.monto_minimo} - ${selectedProducto.monto_maximo}</p>
			</div>
		{/if}

		<div class="field">
			<label for="monto">Monto *</label>
			<input 
				id="monto"
				bind:value={credito.monto} 
				type="number"
				min={selectedProducto?.monto_minimo || 0}
				max={selectedProducto?.monto_maximo || 999999}
				placeholder="Monto del crédito" 
				required 
			/>
		</div>

		<div class="field">
			<label for="observaciones">Observaciones</label>
			<textarea 
				id="observaciones"
				bind:value={credito.observaciones} 
				placeholder="Observaciones adicionales (opcional)"
				rows="3"
			></textarea>
		</div>

		<button type="submit" disabled={loading} class="btn-primary">
			{loading ? 'Otorgando...' : 'Otorgar Crédito'}
		</button>
	</form>
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
	
	.btn-secondary {
		background: #6b7280;
		color: white;
		text-decoration: none;
		padding: 10px 16px;
		border-radius: 6px;
	}
	
	.form { 
		background: white; 
		padding: 24px; 
		border-radius: 8px; 
		box-shadow: 0 1px 3px rgba(0,0,0,0.1);
	}
	
	.field {
		margin-bottom: 20px;
	}
	
	.field label {
		display: block;
		margin-bottom: 6px;
		font-weight: 500;
		color: #374151;
	}
	
	.field input,
	.field select,
	.field textarea { 
		width: 100%; 
		padding: 12px; 
		border: 1px solid #d1d5db; 
		border-radius: 6px; 
		box-sizing: border-box;
		font-size: 16px;
	}
	
	.field input:focus,
	.field select:focus,
	.field textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}
	
	.producto-info {
		background: #f0f9ff;
		padding: 16px;
		border-radius: 6px;
		margin-bottom: 20px;
		border: 1px solid #0ea5e9;
	}
	
	.producto-info h3 {
		margin: 0 0 12px 0;
		color: #0c4a6e;
	}
	
	.producto-info p {
		margin: 4px 0;
		color: #0369a1;
	}
	
	.btn-primary {
		background: #10b981;
		color: white;
		border: none;
		padding: 14px 24px;
		border-radius: 6px;
		cursor: pointer;
		width: 100%;
		font-size: 16px;
		font-weight: 500;
	}
	
	.btn-primary:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}
</style>