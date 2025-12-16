<script>
	import Modal from './Modal.svelte';
	import { db, SYNC_PRIORITY } from '$lib/db/local.js';
	import { createCredito } from '$lib/sync/creditos.js';
	import { showNotification } from '$lib/stores/notifications.js';
	import { calcularCuotasProgramadas, formatearMoneda, formatearFecha } from '$lib/utils/creditos.js';
	import { user } from '$lib/stores/auth.js';
	import { get } from 'svelte/store';
	
	let { 
		open = $bindable(false),
		cliente,
		onSuccess = () => {}
	} = $props();
	
	let productos = $state([]);
	let productoSeleccionado = $state(null);
	let monto = $state('');
	let fechaDesembolso = $state(new Date().toISOString().split('T')[0]);
	let fechaPrimeraCuota = $state(new Date().toISOString().split('T')[0]);
	let mostrarCuotas = $state(false);
	let guardando = $state(false);
	let productosYaCargados = $state(false);
	
	// Cargar productos solo la primera vez que se abre el modal
	$effect(() => {
		if (open && !productosYaCargados) {
			productosYaCargados = true;
			cargarProductos();
			resetForm();
		}
	});
	
	async function cargarProductos() {
		try {
			productos = await db.productos_credito
				.filter(p => p.activo === true)
				.toArray();
		} catch (err) {
			console.error('Error cargando productos:', err);
			showNotification({
				type: 'error',
				message: 'Error al cargar productos',
				duration: 3000
			});
		}
	}
	
	function resetForm() {
		productoSeleccionado = null;
		monto = '';
		const hoy = new Date().toISOString().split('T')[0];
		fechaDesembolso = hoy;
		fechaPrimeraCuota = calcularFechaSugerida(hoy, null);
		mostrarCuotas = false;
		guardando = false;
	}
	
	// Calcular fecha sugerida para primera cuota
	function calcularFechaSugerida(fechaDesembolso, frecuencia, excluirDomingos = false) {
		if (!fechaDesembolso) return new Date().toISOString().split('T')[0];
		
		const fecha = new Date(fechaDesembolso + 'T12:00:00'); // Usar mediodía para evitar problemas de zona horaria
		const diaDesembolso = fecha.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
		
		if (!frecuencia) {
			// Si no hay frecuencia, sugerir día siguiente
			fecha.setDate(fecha.getDate() + 1);
			// Si excluye domingos y cae en domingo, pasar al lunes
			if (excluirDomingos && fecha.getDay() === 0) {
				fecha.setDate(fecha.getDate() + 1);
			}
			return fecha.toISOString().split('T')[0];
		}
		
		switch (frecuencia) {
			case 'DIARIO':
				// Caso especial: Si es sábado y excluye domingos, sumar 2 días (salta domingo)
				if (excluirDomingos && diaDesembolso === 6) {
					fecha.setDate(fecha.getDate() + 2); // Sábado + 2 = Lunes
				} else {
					// Día siguiente normal
					fecha.setDate(fecha.getDate() + 1);
				}
				break;
			case 'SEMANAL':
				// Siguiente domingo
				const diasHastaDomingo = (7 - fecha.getDay()) % 7 || 7;
				fecha.setDate(fecha.getDate() + diasHastaDomingo);
				break;
			case 'QUINCENAL':
				// 15 días después
				fecha.setDate(fecha.getDate() + 15);
				break;
			case 'MENSUAL':
				// Mismo día del siguiente mes
				fecha.setMonth(fecha.getMonth() + 1);
				break;
		}
		
		// Si excluye domingos y la fecha calculada cae en domingo, pasar al lunes
		// (esto aplica para SEMANAL, QUINCENAL, MENSUAL)
		if (excluirDomingos && fecha.getDay() === 0) {
			fecha.setDate(fecha.getDate() + 1);
		}
		
		return fecha.toISOString().split('T')[0];
	}
	
	// Actualizar fecha primera cuota cuando cambia desembolso o producto
	$effect(() => {
		if (productoSeleccionado && fechaDesembolso) {
			console.log('🔄 [MODAL] Actualizando fecha primera cuota:', {
				fechaDesembolso,
				frecuencia: productoSeleccionado.frecuencia,
				excluir_domingos: productoSeleccionado.excluir_domingos
			});
			
			fechaPrimeraCuota = calcularFechaSugerida(
				fechaDesembolso, 
				productoSeleccionado.frecuencia,
				productoSeleccionado.excluir_domingos || false
			);
			
			console.log('✅ [MODAL] Fecha primera cuota calculada:', fechaPrimeraCuota);
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
		
		// Crear crédito temporal para calcular cuotas
		const creditoTemp = {
			numero_cuotas: resumen.numeroCuotas,
			valor_cuota: resumen.valorCuota,
			frecuencia: resumen.frecuencia,
			fecha_primera_cuota: fechaPrimeraCuota,
			excluir_domingos: excluirDomingos
		};
		
		console.log('🔍 [DEBUG] Calculando cuotas con:', {
			frecuencia: creditoTemp.frecuencia,
			fecha_primera_cuota: creditoTemp.fecha_primera_cuota,
			excluir_domingos: creditoTemp.excluir_domingos,
			excluir_domingos_producto: productoSeleccionado?.excluir_domingos,
			producto: productoSeleccionado?.nombre
		});
		
		const cuotas = calcularCuotasProgramadas(creditoTemp);
		if (cuotas.length > 0) {
			console.log('📋 [DEBUG] Primera cuota:', cuotas[0].fecha_programada);
			if (cuotas.length > 1) {
				console.log('📋 [DEBUG] Segunda cuota:', cuotas[1].fecha_programada);
			}
		}
		
		return cuotas;
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
				? (productoSeleccionado.excluir_domingos || false)
				: false;
			
			const cuotas = calcularCuotasProgramadas({
				numero_cuotas: resumen.numeroCuotas,
				valor_cuota: resumen.valorCuota,
				frecuencia: resumen.frecuencia,
				excluir_domingos: excluirDomingosParaCalculo,
				fecha_primera_cuota: fechaPrimeraCuota
			});
			const fechaUltimaCuota = cuotas[cuotas.length - 1].fecha_programada;
			
			// IMPORTANTE: excluir_domingos solo aplica para créditos DIARIOS
			const excluirDomingos = resumen.frecuencia === 'DIARIO' 
				? (productoSeleccionado.excluir_domingos || false)
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
			
			console.log('🎯 [MODAL] Producto seleccionado:', productoSeleccionado.nombre);
			console.log('🎯 [MODAL] Frecuencia:', resumen.frecuencia);
			console.log('🎯 [MODAL] excluir_domingos del producto:', productoSeleccionado.excluir_domingos);
			console.log('🎯 [MODAL] excluir_domingos calculado:', excluirDomingos);
			console.log('🎯 [MODAL] excluir_domingos en creditoData:', creditoData.excluir_domingos);
			
			await createCredito(creditoData);
			
			showNotification({
				type: 'success',
				message: 'Crédito otorgado exitosamente',
				duration: 3000
			});
			
			open = false;
			onSuccess();
			
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
</script>

<Modal bind:open title="Otorgar Crédito" maxWidth="600px">
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
		
		<!-- Botones -->
		<div class="form-actions">
			<button 
				type="button"
				class="btn-cancelar"
				onclick={() => open = false}
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
				{guardando ? 'Guardando...' : 'Otorgar Crédito'}
			</button>
		</div>
	</div>
</Modal>

<style>
	.form-container {
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
	
	.btn-ver-cuotas:hover {
		background: #f8fafc;
		border-color: #4f46e5;
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
	
	.form-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 0.5rem;
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
</style>
