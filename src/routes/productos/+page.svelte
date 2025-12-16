<script>
	import { onMount } from 'svelte';
	import { dataService } from '$lib/db/data-service.js';
	import { isFullyLoaded } from '$lib/stores/simple-auth.js';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	/** @type {Array<any>} */
	let productos = [];
	let showForm = false;
	let newProducto = {
		nombre: '',
		interes_porcentaje: '',
		plazo_dias: '',
		monto_minimo: '',
		monto_maximo: ''
	};

	async function loadProductos() {
		try {
			productos = await dataService.getProductosCredito();
		} catch (error) {
			console.error('Error loading productos:', error);
			// Si no hay usuario autenticado, no intentar cargar datos
			if (error.message.includes('no autenticado')) {
				productos = [];
			}
		}
	}

	async function createProducto() {
		try {
			await dataService.createProductoCredito(newProducto);
			newProducto = { 
				nombre: '', 
				interes_porcentaje: '', 
				plazo_dias: '', 
				monto_minimo: '', 
				monto_maximo: '' 
			};
			showForm = false;
			await loadProductos();
		} catch (error) {
			console.error('Error creating producto:', error);
		}
	}

	// Solo cargar productos cuando esté completamente autenticado y con datos multi-tenant
	$: if ($isFullyLoaded) {
		loadProductos();
	}
</script>

<div class="page">
	<header>
		<h1>Productos de Crédito</h1>
		<button on:click={() => showForm = !showForm}>
			{showForm ? 'Cancelar' : 'Nuevo Producto'}
		</button>
	</header>

	{#if showForm}
		<form on:submit|preventDefault={createProducto} class="form">
			<input 
				bind:value={newProducto.nombre} 
				placeholder="Nombre del producto" 
				required 
			/>
			<input 
				bind:value={newProducto.interes_porcentaje} 
				type="number" 
				step="0.01"
				placeholder="Interés %" 
				required 
			/>
			<input 
				bind:value={newProducto.plazo_dias} 
				type="number" 
				placeholder="Plazo (días)" 
				required 
			/>
			<input 
				bind:value={newProducto.monto_minimo} 
				type="number" 
				placeholder="Monto mínimo" 
				required 
			/>
			<input 
				bind:value={newProducto.monto_maximo} 
				type="number" 
				placeholder="Monto máximo" 
				required 
			/>
			<button type="submit">Crear Producto</button>
		</form>
	{/if}

	<div class="productos">
		{#each productos as producto}
			<div class="producto-card">
				<h3>{producto.nombre}</h3>
				<p>Interés: {producto.interes_porcentaje}%</p>
				<p>Plazo: {producto.plazo_dias} días</p>
				<p>Monto: ${producto.monto_minimo} - ${producto.monto_maximo}</p>
				<small>Creado por: {producto.created_by}</small>
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
	
	header button {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 10px 16px;
		border-radius: 6px;
		cursor: pointer;
	}
	
	.form { 
		background: #f9fafb; 
		padding: 20px; 
		border-radius: 8px; 
		margin: 20px 0; 
	}
	
	.form input { 
		width: 100%; 
		padding: 12px; 
		margin: 8px 0; 
		border: 1px solid #d1d5db; 
		border-radius: 6px; 
		box-sizing: border-box;
	}
	
	.form button {
		background: #10b981;
		color: white;
		border: none;
		padding: 12px 24px;
		border-radius: 6px;
		cursor: pointer;
		width: 100%;
	}
	
	.producto-card { 
		background: white; 
		padding: 16px; 
		border-radius: 8px; 
		margin: 12px 0; 
		box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
	}
	
	.producto-card h3 {
		margin: 0 0 12px 0;
		color: #1f2937;
	}
	
	.producto-card p {
		margin: 4px 0;
		color: #4b5563;
	}
	
	.producto-card small {
		color: #6b7280;
	}
</style>