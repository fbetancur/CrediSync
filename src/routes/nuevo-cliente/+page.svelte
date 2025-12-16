<script>
	import { goto } from '$app/navigation';
	import { dataService } from '$lib/db/data-service.js';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	let cliente = {
		nombre: '',
		documento: '',
		telefono: '',
		email: '',
		direccion: ''
	};

	let loading = false;

	async function createCliente() {
		if (loading) return;
		
		loading = true;
		try {
			await dataService.createCliente(cliente);
			goto('/clientes');
		} catch (error) {
			console.error('Error creating cliente:', error);
			alert('Error al crear cliente');
		} finally {
			loading = false;
		}
	}
</script>

<div class="page">
	<header>
		<h1>Nuevo Cliente</h1>
		<a href="/clientes" class="btn-secondary">Cancelar</a>
	</header>

	<form on:submit|preventDefault={createCliente} class="form">
		<div class="field">
			<label for="nombre">Nombre completo *</label>
			<input 
				id="nombre"
				bind:value={cliente.nombre} 
				placeholder="Nombre completo del cliente" 
				required 
			/>
		</div>

		<div class="field">
			<label for="documento">Documento *</label>
			<input 
				id="documento"
				bind:value={cliente.documento} 
				placeholder="Cédula o documento de identidad" 
				required 
			/>
		</div>

		<div class="field">
			<label for="telefono">Teléfono *</label>
			<input 
				id="telefono"
				bind:value={cliente.telefono} 
				type="tel"
				placeholder="Número de teléfono" 
				required 
			/>
		</div>

		<div class="field">
			<label for="email">Email</label>
			<input 
				id="email"
				bind:value={cliente.email} 
				type="email"
				placeholder="Correo electrónico (opcional)" 
			/>
		</div>

		<div class="field">
			<label for="direccion">Dirección</label>
			<textarea 
				id="direccion"
				bind:value={cliente.direccion} 
				placeholder="Dirección completa (opcional)"
				rows="3"
			></textarea>
		</div>

		<button type="submit" disabled={loading} class="btn-primary">
			{loading ? 'Creando...' : 'Crear Cliente'}
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
	.field textarea { 
		width: 100%; 
		padding: 12px; 
		border: 1px solid #d1d5db; 
		border-radius: 6px; 
		box-sizing: border-box;
		font-size: 16px;
	}
	
	.field input:focus,
	.field textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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