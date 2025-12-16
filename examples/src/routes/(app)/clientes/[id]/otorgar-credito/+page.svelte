<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { db } from '$lib/db/local.js';
	import { createCredito } from '$lib/sync/creditos.js';
	import { showNotification } from '$lib/stores/notifications.js';
	import { calcularCuotasProgramadas, formatearMoneda, formatearFecha } from '$lib/utils/creditos.js';
	import { user } from '$lib/stores/auth.js';
	import { get } from 'svelte/store';
	
	const clienteId = $derived($page.params.id);
	
	let cliente = $state(null);
	let productos = $state([]);
	let productoSeleccionado = $state(null);
	let monto = $state('');
	let fechaDesembolso = $state(new Date().toISOString().split('T')[0]);
	let fechaPrimeraCuota = $state(new Date().toISOString().split('T')[0]);
	let mostrarCuotas = $state(false);
	let guardando = $state(false);
	let loading = $state(true);
	
	onMount(async () => {
		await cargarDatos();
	});
	
	async function cargarDatos() {
		try {
			loading = true;
			
			// Cargar cliente
			cliente = await db.clientes.get(clienteId);
			
			if (!cliente) {
				showNotification({
					type: 'error',
					message: 'Cliente no encontrado',
					duration: 3000
				});
				goto('/clientes');
				return;
			}
			
			// Cargar productos activos
			productos = await db.productos_credito
				.filter(p => p.activo === true)
				.toArray();
			
			// Inicializar fecha primera cuota (sin producto seleccionado aún)
			fechaPrimeraCuota = calcularFechaSugerida(fechaDesembolso, null, false);
			
		} catch (err) {
			console.error('Error cargando datos:', err);
			showNotification({
				type: 'error',
				message: 'Error al cargar datos',
				duration: 3000
			});
		} finally {
			loading = false;
		}
	}
	
	// Calcular fecha sugerida para primera cuota
	function calcularFechaSugerida(fechaDesembolso, frecuencia, excluirDomingos = false) {
		if (!fechaDesembolso) return new Date().toISOString().split('T')[0];
		
		const fecha = new Date(fechaDesembolso + 'T12:00:00');
		
		if (!frecuencia) {
			fecha.setDate(fecha.getDate() + 1);
			// Si excluye domingos y mañana es domingo, saltar al lunes
			if (excluirDomingos && fecha.getDay() === 0) {
				fecha.setDate(fecha.getDate() + 1);
			}
			return fecha.toISOString().split('T')[0];
		}
		
		switch (frecuencia) {
			case 'DIARIO':
				fecha.setDate(fecha.getDate() + 1);
				// Si excluye domingos y la fecha calculada es domingo, saltar al lunes
				if (excluirDomingos && fecha.getDay() === 0) {
					fecha.setDate(fecha.getDate() + 1);
				}
				break;
			case 'SEMANAL':
				const diasHastaDomingo = (7 - fecha.getDay()) % 7 || 7;
				fecha.setDate(fecha.getDate() + diasHastaDomingo);
				break;
			case 'QUINCENAL':
				fecha.setDate(fecha.getDate() + 15);
				break;
			case 'MENSUAL':
				fecha.setMonth(fecha.getMonth() + 1);
				break;
		}
		
		return fecha.toISOString().split('T')[0];
	}
	
	// Actualizar fecha primera cuota cuando cambia desembolso o producto
	$effect(() => {
		if (productoSeleccionado && fechaDesembolso) {
			const excluirDomingos = productoSeleccionado.frecuencia === 'DIARIO' 
				? (productoSeleccionado.excluir_domingos || false)
				: false;
			fechaPrimeraCuota = calcularFechaSugerida(
				fechaDesembolso, 
				productoSeleccionado.frecuencia,
				excluirDomingos
			);
		}
	});
	
	// Validaciones
	let montoValido = $derived.by(() => {
		if (!productoSeleccionado || !monto) return null;
		const m = parseFloat(monto);
		if (isNaN(m)) return false;
		return m >= productoSeleccionado.monto_minimo && m <= productoSeleccionado.monto_maximo;
	});
	
	let errorMonto = $derived.by(() => {
		if (!productoSeleccionado || !monto) return '';
		const m = parseFloat(monto);
		if (isNaN(m)) return 'Monto inválido';
		if (m < productoSeleccionado.monto_minimo) {
			return `Mínimo: ${formatearMoneda(productoSeleccionado.monto_minimo)}`;
		}
		if (m > productoSeleccionado.monto_maximo) {
			return `Máximo: ${formatearMoneda(productoSeleccionado.monto_maximo)}`;
		}
		return '';
	});
	
	// Cálculos en tiempo real
	let resumen = $derived.by(() => {
		if (!productoSeleccionado || !montoValido) return null;
		
		const montoOriginal = parseFloat(monto);
		const interesPorcentaje = parseFloat(productoSeleccionado.interes_porcentaje);
		const numeroCuotas = productoSeleccionado.numero_cuotas;
		
		const totalAPagar = montoOriginal * (1 + interesPorcentaje / 100);
		const valorCuota = totalAPagar / numeroCuotas;
		
		return {
			montoOriginal,
			interesPorcentaje,
			numeroCuotas,
			totalAPagar,
			valorCuota,
			frecuencia: productoSeleccionado.frecuencia
		};
	});
	
	// Cuotas programadas (lazy - solo si se expande)
	let cuotasProgramadas = $derived.by(() => {
		if (!mostrarCuotas || !resumen) return [];
		
		// IMPORTANTE: excluir_domingos solo aplica para créditos DIARIOS
		const excluirDomingos = resumen.frecuencia === 'DIARIO' 
			? (productoSeleccionado?.excluir_domingos || false)
			: false;
		
		const creditoTemp = {
			numero_cuotas: resumen.numeroCuotas,
			valor_cuota: resumen.valorCuota,
			frecuencia: resumen.frecuencia,
			fecha_primera_cuota: fechaPrimeraCuota,
			excluir_domingos: excluirDomingos
		};
		
		return calcularCuotasProgramadas(creditoTemp);
	});
	
	let formularioValido = $derived(
		productoSeleccionado && 
		montoValido && 
		fechaDesembolso && 
		fechaPrimeraCuota
	);
	
	async function handleGuardar() {
		if (!formularioValido || guardando) return;
		
		guardando = true;
		
		try {
			const currentUser = get(user);
			
			// Calcular fecha última cuota
			// IMPORTANTE: excluir_domingos solo aplica para créditos DIARIOS
			const excluirDomingosParaCalculo = resumen.frecuencia === 'DIARIO' 
				? (productoSeleccionado?.excluir_domingos || false)
				: false;
			
			const cuotas = calcularCuotasProgramadas({
				numero_cuotas: resumen.numeroCuotas,
				valor_cuota: resumen.valorCuota,
				frecuencia: resumen.frecuencia,
				fecha_primera_cuota: fechaPrimeraCuota,
				excluir_domingos: excluirDomingosParaCalculo
			});
			const fechaUltimaCuota = cuotas[cuotas.length - 1].fecha_programada;
			
			// IMPORTANTE: excluir_domingos solo aplica para créditos DIARIOS
			const excluirDomingos = resumen.frecuencia === 'DIARIO' 
				? (productoSeleccionado?.excluir_domingos || false)
				: false;
			
			const creditoData = {
				cliente_id: cliente.id,
				producto_id: productoSeleccionado.id,
				cobrador_id: currentUser.id,
				ruta_id: cliente.ruta_id,
				monto_original: resumen.montoOriginal,
				interes_porcentaje: resumen.interesPorcentaje,
				total_a_pagar: resumen.totalAPagar,
				numero_cuotas: resumen.numeroCuotas,
				valor_cuota: resumen.valorCuota,
				frecuencia: resumen.frecuencia,
				excluir_domingos: excluirDomingos,
				fecha_desembolso: fechaDesembolso,
				fecha_primera_cuota: fechaPrimeraCuota,
				fecha_ultima_cuota: fechaUltimaCuota,
				estado: 'ACTIVO'
			};
			
			console.log('🎯 [PAGINA] Producto seleccionado:', productoSeleccionado.nombre);
			console.log('🎯 [PAGINA] Frecuencia:', resumen.frecuencia);
			console.log('🎯 [PAGINA] excluir_domingos del producto:', productoSeleccionado.excluir_domingos);
			console.log('🎯 [PAGINA] excluir_domingos calculado:', excluirDomingos);
			console.log('🎯 [PAGINA] excluir_domingos en creditoData:', creditoData.excluir_domingos);
			
			// Crear crédito y generar cuotas
			await createCredito(creditoData);
			
			showNotification({
				type: 'success',
				message: `Crédito otorgado con ${resumen.numeroCuotas} cuotas generadas`,
				duration: 3000
			});
			
			// Volver a la página del cliente
			goto(`/clientes/${clienteId}`);
			
		} catch (err) {
			console.error('Error al otorgar crédito:', err);
			showNotification({
				type: 'error',
				message: 'Error al otorgar crédito',
				duration: 3000
			});
		} finally {
			guardando = false;
		}
	}
	
	function handleCancelar() {
		goto(`/clientes/${clienteId}`);
	}
</script>

{#if loading}
	<div class="loading-container">
		<p>Cargando...</p>
	</div>
{:else if cliente}
	<div class="otorgar-page">
		<!-- Header -->
		<div class="header">
			<button onclick={handleCancelar} class="btn-back" disabled={guardando}>
				← Cancelar
			</button>
			<h1>Otorgar Crédito</h1>
		</div>
		
		<!-- Info Cliente -->
		<div class="cliente-info">
			<h2>{cliente.nombre}</h2>
			<p>Documento: {cliente.documento}</p>
		</div>
		
		<!-- Formulario -->
		<div class="form-container">
			<!-- Selección de Producto -->
			<div class="form-group">
				<label for="producto">Producto de Crédito</label>
				<select 
					id="producto" 
					bind:value={productoSeleccionado}
					disabled={guardando}
				>
					<option value={null}>Seleccione un producto...</option>
					{#each productos as producto (producto.id)}
						<option value={producto}>
							{producto.nombre} - {producto.numero_cuotas} cuotas {producto.frecuencia}
						</option>
					{/each}
				</select>
			</div>
			
			{#if productoSeleccionado}
				<!-- Información del Producto -->
				<div class="producto-info">
					<div class="info-item">
						<span class="info-label">Interés:</span>
						<span class="info-value">{productoSeleccionado.interes_porcentaje}%</span>
					</div>
					<div class="info-item">
						<span class="info-label">Rango:</span>
						<span class="info-value">
							{formatearMoneda(productoSeleccionado.monto_minimo)} - 
							{formatearMoneda(productoSeleccionado.monto_maximo)}
						</span>
					</div>
				</div>
				
				<!-- Monto -->
				<div class="form-group">
					<label for="monto">Monto a Prestar</label>
					<input 
						id="monto"
						type="number"
						inputmode="decimal"
						bind:value={monto}
						placeholder="Ingrese el monto"
						min={productoSeleccionado.monto_minimo}
						max={productoSeleccionado.monto_maximo}
						step="100"
						disabled={guardando}
						class:error={errorMonto}
					/>
					{#if errorMonto}
						<span class="error-message">{errorMonto}</span>
					{/if}
				</div>
				
				<!-- Fechas -->
				<div class="form-row">
					<div class="form-group">
						<label for="fecha-desembolso">Fecha Desembolso</label>
						<input 
							id="fecha-desembolso"
							type="date"
							bind:value={fechaDesembolso}
							disabled={guardando}
						/>
					</div>
					<div class="form-group">
						<label for="fecha-primera-cuota">Primera Cuota</label>
						<input 
							id="fecha-primera-cuota"
							type="date"
							bind:value={fechaPrimeraCuota}
							disabled={guardando}
						/>
					</div>
				</div>
				
				<!-- Resumen Calculado -->
				{#if resumen}
					<div class="resumen">
						<h3>Resumen del Crédito</h3>
						<div class="resumen-grid">
							<div class="resumen-item">
								<span class="resumen-label">Monto Original</span>
								<span class="resumen-value">{formatearMoneda(resumen.montoOriginal)}</span>
							</div>
							<div class="resumen-item">
								<span class="resumen-label">Interés ({resumen.interesPorcentaje}%)</span>
								<span class="resumen-value">
									{formatearMoneda(resumen.totalAPagar - resumen.montoOriginal)}
								</span>
							</div>
							<div class="resumen-item highlight">
								<span class="resumen-label">Total a Pagar</span>
								<span class="resumen-value">{formatearMoneda(resumen.totalAPagar)}</span>
							</div>
							<div class="resumen-item highlight">
								<span class="resumen-label">Valor Cuota</span>
								<span class="resumen-value">{formatearMoneda(resumen.valorCuota)}</span>
							</div>
						</div>
						
						<!-- Botón Ver Cuotas (Colapsable) -->
						<button 
							type="button"
							class="btn-ver-cuotas"
							onclick={() => mostrarCuotas = !mostrarCuotas}
							disabled={guardando}
						>
							{mostrarCuotas ? '▼' : '▶'} Ver Tabla de Cuotas ({resumen.numeroCuotas})
						</button>
						
						<!-- Tabla de Cuotas (Lazy Render) -->
						{#if mostrarCuotas}
							<div class="tabla-cuotas">
								<table>
									<thead>
										<tr>
											<th>#</th>
											<th>Fecha</th>
											<th>Monto</th>
										</tr>
									</thead>
									<tbody>
										{#each cuotasProgramadas as cuota (cuota.numero)}
											<tr>
												<td>{cuota.numero}</td>
												<td>{formatearFecha(cuota.fecha_programada)}</td>
												<td>{formatearMoneda(cuota.monto_programado)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
		
		<!-- Botones Fijos Inferiores -->
		<div class="form-actions">
			<button 
				type="button"
				class="btn-cancelar"
				onclick={handleCancelar}
				disabled={guardando}
			>
				Cancelar
			</button>
			<button 
				type="button"
				class="btn-guardar"
				onclick={handleGuardar}
				disabled={!formularioValido || guardando}
			>
				{guardando ? 'Generando cuotas...' : 'Otorgar Crédito'}
			</button>
		</div>
	</div>
{:else}
	<div class="error-container">
		<p>Cliente no encontrado</p>
		<button onclick={() => goto('/clientes')} class="btn-primario">Volver</button>
	</div>
{/if}

<style>
	.otorgar-page {
		min-height: 100vh;
		background: #f8fafc;
		padding-bottom: 180px; /* Aumentado para evitar que los botones queden ocultos por bottom nav (64px) + form-actions (~80px) */
	}
	
	/* Header */
	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: linear-gradient(180deg, #eef2ff 0%, #ffffff 100%);
		border-bottom: 1px solid #c7d2fe;
		box-shadow: 0 2px 6px rgba(79, 70, 229, 0.1);
	}
	
	.header h1 {
		margin: 0;
		font-size: 1.125rem;
		color: #1e293b;
		font-weight: 700;
	}
	
	.btn-back {
		padding: 0.5rem 1rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		color: #4f46e5;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.btn-back:hover:not(:disabled) {
		background: #f8fafc;
		border-color: #4f46e5;
	}
	
	.btn-back:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	/* Info Cliente */
	.cliente-info {
		padding: 1rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}
	
	.cliente-info h2 {
		margin: 0 0 0.25rem 0;
		font-size: 1.25rem;
		color: #1e293b;
	}
	
	.cliente-info p {
		margin: 0;
		font-size: 0.9375rem;
		color: #64748b;
	}
	
	/* Formulario */
	.form-container {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	
	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #475569;
	}
	
	select,
	input {
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 1rem;
		transition: all 0.2s;
		background: white;
	}
	
	input[type="date"] {
		padding: 0.625rem 0.5rem;
		font-size: 0.9375rem;
	}
	
	select:focus,
	input:focus {
		outline: none;
		border-color: #4f46e5;
		box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
	}
	
	input.error {
		border-color: #ef4444;
	}
	
	select:disabled,
	input:disabled {
		background: #f1f5f9;
		cursor: not-allowed;
	}
	
	.error-message {
		font-size: 0.875rem;
		color: #ef4444;
	}
	
	.producto-info {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		padding: 1rem;
		background: #f8fafc;
		border-radius: 8px;
	}
	
	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	
	.info-label {
		font-size: 0.75rem;
		color: #94a3b8;
	}
	
	.info-value {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #1e293b;
	}
	
	.resumen {
		padding: 1rem;
		background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%);
		border: 2px solid #c7d2fe;
		border-radius: 12px;
	}
	
	.resumen h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #4f46e5;
	}
	
	.resumen-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.resumen-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	
	.resumen-item.highlight {
		padding: 0.75rem;
		background: white;
		border-radius: 8px;
	}
	
	.resumen-label {
		font-size: 0.75rem;
		color: #64748b;
	}
	
	.resumen-value {
		font-size: 1.125rem;
		font-weight: 700;
		color: #1e293b;
	}
	
	.btn-ver-cuotas {
		width: 100%;
		padding: 0.75rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		color: #4f46e5;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}
	
	.btn-ver-cuotas:hover:not(:disabled) {
		background: #f8fafc;
		border-color: #4f46e5;
	}
	
	.btn-ver-cuotas:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.tabla-cuotas {
		margin-top: 1rem;
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}
	
	table {
		width: 100%;
		border-collapse: collapse;
		background: white;
	}
	
	thead {
		position: sticky;
		top: 0;
		background: #f8fafc;
		z-index: 1;
	}
	
	th {
		padding: 0.75rem;
		text-align: left;
		font-size: 0.875rem;
		font-weight: 600;
		color: #64748b;
		border-bottom: 2px solid #e5e7eb;
	}
	
	td {
		padding: 0.75rem;
		font-size: 0.875rem;
		color: #1e293b;
		border-bottom: 1px solid #f1f5f9;
	}
	
	tbody tr:hover {
		background: #f8fafc;
	}
	
	/* Botones Fijos Inferiores */
	.form-actions {
		position: fixed;
		bottom: 64px; /* Justo encima del bottom nav */
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		padding: 1rem;
		background: white;
		border-top: 2px solid #e5e7eb;
		box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
		z-index: 30; /* Mayor que bottom nav (z-index: 40) pero visible */
	}
	
	.btn-cancelar,
	.btn-guardar {
		padding: 0.875rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.btn-cancelar {
		background: white;
		border: 1px solid #d1d5db;
		color: #64748b;
	}
	
	.btn-cancelar:hover:not(:disabled) {
		background: #f8fafc;
		border-color: #94a3b8;
	}
	
	.btn-guardar {
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
		border: none;
		color: white;
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
	}
	
	.btn-guardar:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
	}
	
	.btn-guardar:disabled,
	.btn-cancelar:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	/* Estados */
	.loading-container,
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		text-align: center;
	}
	
	.btn-primario {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
	}
	
	.btn-primario:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
	}
</style>
