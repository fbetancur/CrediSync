<script>
	import { onMount } from 'svelte';
	import { getProductos, createProducto, updateProducto, toggleProductoActivo, syncProductosToSupabase } from '$lib/sync/productos.js';
	import { syncCounter, isOnline } from '$lib/stores/sync.js';
	
	let productos = $state([]);
	let loading = $state(true);
	let showForm = $state(false);
	let editingId = $state(null);
	
	// Datos del formulario
	let formData = $state({
		nombre: '',
		interes_porcentaje: '',
		numero_cuotas: '',
		frecuencia: 'DIARIO',
		monto_minimo: '',
		monto_maximo: '',
		excluir_domingos: false
	});
	
	// Cálculo de ejemplo
	let ejemploCalculo = $derived.by(() => {
		const monto = 1000;
		const interes = parseFloat(formData.interes_porcentaje) || 0;
		const cuotas = parseInt(formData.numero_cuotas) || 1;
		
		const montoInteres = monto * (interes / 100);
		const totalPagar = monto + montoInteres;
		const valorCuota = totalPagar / cuotas;
		
		return {
			interes: montoInteres.toFixed(2),
			total: totalPagar.toFixed(2),
			cuota: valorCuota.toFixed(2)
		};
	});
	
	// Preseleccionar "excluir domingos" cuando se selecciona DIARIO
	$effect(() => {
		if (formData.frecuencia === 'DIARIO' && !editingId) {
			formData.excluir_domingos = true;
		}
	});
	
	onMount(async () => {
		await cargarProductos();
		
		if ($isOnline) {
			setTimeout(() => syncProductosToSupabase(), 100);
		}
		
		const unsubscribe = syncCounter.subscribe(() => {
			cargarProductos();
		});
		
		return () => unsubscribe();
	});
	
	async function cargarProductos() {
		try {
			loading = true;
			productos = await getProductos();
		} catch (err) {
			console.error('Error cargando productos:', err);
			productos = [];
		} finally {
			loading = false;
		}
	}
	
	function nuevoProducto() {
		editingId = null;
		formData = {
			nombre: '',
			interes_porcentaje: '',
			numero_cuotas: '',
			frecuencia: 'DIARIO',
			monto_minimo: '',
			monto_maximo: '',
			excluir_domingos: false
		};
		showForm = true;
	}
	
	function editarProducto(producto) {
		editingId = producto.id;
		formData = {
			nombre: producto.nombre,
			interes_porcentaje: producto.interes_porcentaje.toString(),
			numero_cuotas: producto.numero_cuotas.toString(),
			frecuencia: producto.frecuencia,
			monto_minimo: producto.monto_minimo.toString(),
			monto_maximo: producto.monto_maximo.toString(),
			excluir_domingos: producto.excluir_domingos || false
		};
		showForm = true;
	}
	
	async function guardarProducto() {
		try {
			const productoData = {
				nombre: formData.nombre.trim(),
				interes_porcentaje: parseFloat(formData.interes_porcentaje),
				numero_cuotas: parseInt(formData.numero_cuotas),
				frecuencia: formData.frecuencia,
				monto_minimo: parseFloat(formData.monto_minimo),
				monto_maximo: parseFloat(formData.monto_maximo),
				excluir_domingos: formData.excluir_domingos,
				activo: true
			};
			
			if (editingId) {
				await updateProducto(editingId, productoData);
			} else {
				await createProducto(productoData);
			}
			
			showForm = false;
			await cargarProductos();
		} catch (err) {
			console.error('Error guardando producto:', err);
		}
	}
	
	async function cambiarEstado(id, activo) {
		try {
			await toggleProductoActivo(id, !activo);
			await cargarProductos();
		} catch (err) {
			console.error('Error cambiando estado:', err);
		}
	}
	
	function cancelar() {
		showForm = false;
		editingId = null;
	}
</script>

<div class="productos-page">
	{#if !showForm}
		<!-- Lista de productos -->
		<div class="header-container">
			<div class="header-content">
				<h1>Productos de Crédito</h1>
				<p>Gestiona los productos disponibles</p>
			</div>
			<button onclick={nuevoProducto} class="add-btn">
				<svg class="add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
			</button>
		</div>
		
		<div class="productos-list">
			{#if loading}
				<p class="empty-state">Cargando productos...</p>
			{:else if productos.length === 0}
				<p class="empty-state">No hay productos configurados</p>
			{:else}
				{#each productos as producto (producto.id)}
					<div class="producto-card">
						<div class="producto-info">
							<h3>{producto.nombre}</h3>
							<div class="producto-details">
								<span>💰 {producto.interes_porcentaje}% interés</span>
								<span>📅 {producto.numero_cuotas} cuotas</span>
								<span>🔄 {producto.frecuencia}</span>
							</div>
							<div class="producto-montos">
								<span>Min: ${producto.monto_minimo}</span>
								<span>Max: ${producto.monto_maximo}</span>
							</div>
						</div>
						<div class="producto-actions">
							<span class="badge {producto.activo ? 'activo' : 'inactivo'}">
								{producto.activo ? 'ACTIVO' : 'INACTIVO'}
							</span>
							<div class="action-buttons">
								<button onclick={() => editarProducto(producto)} class="btn-edit">
									✏️
								</button>
								<button 
									onclick={() => cambiarEstado(producto.id, producto.activo)} 
									class="btn-toggle"
								>
									{producto.activo ? '🔴' : '🟢'}
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<!-- Formulario -->
		<div class="form-container">
			<div class="form-header">
				<h2>{editingId ? 'Editar' : 'Nuevo'} Producto</h2>
			</div>
			
			<form onsubmit={(e) => { e.preventDefault(); guardarProducto(); }} class="form-content">
				<div class="form-group">
					<label for="nombre">Nombre del Producto *</label>
					<input
						id="nombre"
						type="text"
						bind:value={formData.nombre}
						required
						placeholder="Ej: Crédito Diario"
					/>
				</div>
				
				<div class="form-row">
					<div class="form-group">
						<label for="interes">Interés (%) *</label>
						<input
							id="interes"
							type="number"
							inputmode="decimal"
							step="0.01"
							bind:value={formData.interes_porcentaje}
							required
							placeholder="20"
						/>
					</div>
					
					<div class="form-group">
						<label for="cuotas">Número de Cuotas *</label>
						<input
							id="cuotas"
							type="number"
							inputmode="numeric"
							bind:value={formData.numero_cuotas}
							required
							placeholder="30"
						/>
					</div>
				</div>
				
				<div class="form-group">
					<label for="frecuencia">Frecuencia de Pago *</label>
					<select id="frecuencia" bind:value={formData.frecuencia} required>
						<option value="DIARIO">Diario</option>
						<option value="SEMANAL">Semanal</option>
						<option value="QUINCENAL">Quincenal</option>
						<option value="MENSUAL">Mensual</option>
					</select>
				</div>
				
				{#if formData.frecuencia === 'DIARIO'}
					<div class="form-group checkbox-group">
						<label>
							<input
								type="checkbox"
								bind:checked={formData.excluir_domingos}
							/>
							<span>Excluir domingos</span>
						</label>
					</div>
				{/if}
				
				<div class="form-row">
					<div class="form-group">
						<label for="min">Monto Mínimo *</label>
						<input
							id="min"
							type="number"
							inputmode="decimal"
							step="0.01"
							bind:value={formData.monto_minimo}
							required
							placeholder="1000"
						/>
					</div>
					
					<div class="form-group">
						<label for="max">Monto Máximo *</label>
						<input
							id="max"
							type="number"
							inputmode="decimal"
							step="0.01"
							bind:value={formData.monto_maximo}
							required
							placeholder="50000"
						/>
					</div>
				</div>
				
				<!-- Ejemplo de cálculo -->
				<div class="calculo-ejemplo">
					<h4>Ejemplo de Cálculo (Préstamo de $1,000)</h4>
					<div class="calculo-grid">
						<div class="calculo-item">
							<span class="calculo-label">Interés:</span>
							<span class="calculo-value">${ejemploCalculo.interes}</span>
						</div>
						<div class="calculo-item">
							<span class="calculo-label">Total a Pagar:</span>
							<span class="calculo-value">${ejemploCalculo.total}</span>
						</div>
						<div class="calculo-item">
							<span class="calculo-label">Valor Cuota:</span>
							<span class="calculo-value">${ejemploCalculo.cuota}</span>
						</div>
					</div>
				</div>
				
				<div class="form-actions">
					<button type="button" onclick={cancelar} class="btn-cancel">
						Cancelar
					</button>
					<button type="submit" class="btn-save">
						Guardar
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>

<style>
	.productos-page {
		min-height: 100%;
		background: #f8fafc;
	}
	
	.header-container {
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
	
	.header-content h1 {
		margin: 0;
		font-size: 1.25rem;
		color: #1e293b;
	}
	
	.header-content p {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		color: #64748b;
	}
	
	.add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #4338ca 100%);
		border: none;
		border-radius: 12px;
		color: white;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
	}
	
	.add-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
	}
	
	.add-icon {
		width: 22px;
		height: 22px;
		stroke-width: 2.5;
	}
	
	.productos-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
	}
	
	.producto-card {
		display: flex;
		justify-content: space-between;
		padding: 1rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}
	
	.producto-info h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		color: #1e293b;
	}
	
	.producto-details {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}
	
	.producto-details span {
		font-size: 0.875rem;
		color: #64748b;
	}
	
	.producto-montos {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
		color: #059669;
		font-weight: 600;
	}
	
	.producto-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
	}
	
	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}
	
	.badge.activo {
		background: #e8f5e9;
		color: #2e7d32;
	}
	
	.badge.inactivo {
		background: #ffebee;
		color: #c62828;
	}
	
	.action-buttons {
		display: flex;
		gap: 0.5rem;
	}
	
	.btn-edit, .btn-toggle {
		width: 36px;
		height: 36px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: white;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 1rem;
	}
	
	.btn-edit:hover, .btn-toggle:hover {
		background: #f8fafc;
		transform: scale(1.05);
	}
	
	.empty-state {
		text-align: center;
		padding: 3rem;
		color: #999;
	}
	
	/* Formulario */
	.form-container {
		background: white;
		margin: 1rem;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	
	.form-header {
		padding: 1rem;
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
		border-radius: 12px 12px 0 0;
	}
	
	.form-header h2 {
		margin: 0;
		color: white;
		font-size: 1.25rem;
	}
	
	.form-content {
		padding: 1.5rem;
	}
	
	.form-group {
		margin-bottom: 1.25rem;
	}
	
	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #1e293b;
		font-size: 0.875rem;
	}
	
	.form-group input,
	.form-group select {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.9375rem;
		transition: all 0.2s;
	}
	
	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
	}
	
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	
	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	
	.checkbox-group input[type="checkbox"] {
		width: auto;
		cursor: pointer;
	}
	
	.calculo-ejemplo {
		margin: 1.5rem 0;
		padding: 1rem;
		background: #eef2ff;
		border-radius: 8px;
		border: 1px solid #c7d2fe;
	}
	
	.calculo-ejemplo h4 {
		margin: 0 0 1rem 0;
		color: #4338ca;
		font-size: 0.9375rem;
	}
	
	.calculo-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}
	
	.calculo-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	
	.calculo-label {
		font-size: 0.75rem;
		color: #64748b;
	}
	
	.calculo-value {
		font-size: 1.125rem;
		font-weight: 700;
		color: #2563eb;
	}
	
	.form-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	
	.btn-cancel, .btn-save {
		flex: 1;
		padding: 0.875rem;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.btn-cancel {
		background: #f1f5f9;
		color: #64748b;
	}
	
	.btn-cancel:hover {
		background: #e2e8f0;
	}
	
	.btn-save {
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
		color: white;
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
	}
	
	.btn-save:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
	}
	
	@media (max-width: 640px) {
		.calculo-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
