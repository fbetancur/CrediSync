<script>
	import { onMount } from 'svelte';
	import Modal from './Modal.svelte';
	import { db } from '$lib/db/local.js';
	import { getCuotasCredito } from '$lib/sync/cuotas.js';
	import { registrarPago } from '$lib/sync/pagos.js';
	import { formatearMoneda } from '$lib/utils/creditos.js';
	import { showNotification } from '$lib/stores/notifications.js';
	
	let { 
		open = $bindable(false),
		cliente = null,
		cuotasDelDia = [],
		cuotasVencidas = [],
		onSuccess = () => {}
	} = $props();
	
	// Debug: Ver qué se recibe
	$effect(() => {
		if (open) {
			console.log('📋 Modal abierto con:', {
				cliente: cliente?.nombre,
				cuotasDelDia: cuotasDelDia.length,
				cuotasVencidas: cuotasVencidas.length
			});
		}
	});
	
	let monto = $state('');
	let loading = $state(false);
	let preview = $state([]);
	let debounceTimer = null;
	let filtroSeleccionado = $state(null); // 'hoy', 'atrasadas', 'todo', null
	
	// Calcular montos rápidos
	let montoSoloHoy = $derived(
		cuotasDelDia.reduce((sum, c) => sum + c.saldo_pendiente, 0)
	);
	
	let montoAtrasadas = $derived(
		cuotasVencidas.reduce((sum, c) => sum + c.saldo_pendiente, 0)
	);
	
	let montoTodoAlDia = $derived(
		montoSoloHoy + montoAtrasadas
	);
	
	// Obtener todos los créditos del cliente
	let creditos = $state([]);
	
	$effect(() => {
		if (open && cliente) {
			cargarCreditos();
		}
	});
	
	async function cargarCreditos() {
		try {
			creditos = await db.creditos
				.where('cliente_id')
				.equals(cliente.id)
				.and(c => c.estado === 'ACTIVO')
				.toArray();
			
			console.log(`✅ Créditos cargados para ${cliente.nombre}:`, creditos.length);
		} catch (err) {
			console.error('Error cargando créditos:', err);
			creditos = [];
		}
	}
	
	// Calcular preview cuando cambia el monto (con debounce optimizado)
	$effect(() => {
		if (monto && parseFloat(monto) > 0) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				calcularPreview();
			}, 500); // ✅ Aumentado de 300ms a 500ms
		} else {
			preview = [];
		}
	});
	
	async function calcularPreview() {
		try {
			const montoPago = parseFloat(monto);
			if (isNaN(montoPago) || montoPago <= 0) {
				preview = [];
				return;
			}
			
			// Validar que hay créditos
			if (!creditos || creditos.length === 0) {
				console.warn('No hay créditos activos para calcular preview');
				preview = [];
				return;
			}
			
			// Obtener todas las cuotas pendientes del cliente (ordenadas por fecha)
			const todasLasCuotas = [];
			
			for (const credito of creditos) {
				try {
					const cuotasCredito = await getCuotasCredito(credito.id);
					if (!cuotasCredito || cuotasCredito.length === 0) {
						console.warn(`No hay cuotas para el crédito ${credito.id}`);
						continue;
					}
					
					const cuotasPendientes = cuotasCredito
						.filter(c => c.estado !== 'PAGADA' && c.saldo_pendiente > 0)
						.sort((a, b) => new Date(a.fecha_programada) - new Date(b.fecha_programada));
					
					todasLasCuotas.push(...cuotasPendientes.map(c => ({
						...c,
						credito_numero: credito.numero_credito || `Crédito ${credito.id.substring(0, 8)}`
					})));
				} catch (err) {
					console.error(`Error obteniendo cuotas del crédito ${credito.id}:`, err);
				}
			}
			
			if (todasLasCuotas.length === 0) {
				console.warn('No hay cuotas pendientes para mostrar preview');
				preview = [];
				return;
			}
			
			// Ordenar todas las cuotas por fecha
			todasLasCuotas.sort((a, b) => new Date(a.fecha_programada) - new Date(b.fecha_programada));
			
			// Simular distribución del pago
			let montoRestante = montoPago;
			const previewCuotas = [];
			
			for (const cuota of todasLasCuotas) {
				if (montoRestante <= 0) break;
				
				const saldoPendiente = cuota.saldo_pendiente || 0;
				if (saldoPendiente <= 0) continue;
				
				const montoPagado = Math.min(montoRestante, saldoPendiente);
				const nuevoSaldo = Math.max(0, saldoPendiente - montoPagado);
				
				let nuevoEstado = 'PENDIENTE';
				if (nuevoSaldo === 0) {
					nuevoEstado = 'PAGADA';
				} else if (montoPagado > 0) {
					nuevoEstado = 'PARCIAL';
				}
				
				previewCuotas.push({
					numero: cuota.numero,
					credito_numero: cuota.credito_numero,
					fecha_programada: cuota.fecha_programada,
					monto_programado: cuota.monto_programado,
					monto_pagado_anterior: cuota.monto_pagado || 0,
					monto_pago_nuevo: montoPagado,
					saldo_anterior: saldoPendiente,
					saldo_nuevo: nuevoSaldo,
					estado_anterior: cuota.estado,
					estado_nuevo: nuevoEstado
				});
				
				montoRestante -= montoPagado;
			}
			
			preview = previewCuotas;
			console.log(`✅ Preview calculado: ${previewCuotas.length} cuotas afectadas`);
			
		} catch (err) {
			console.error('Error calculando preview:', err);
			preview = [];
			showNotification({ 
				type: 'error', 
				message: 'Error calculando preview del pago' 
			});
		}
	}
	
	function seleccionarMontoRapido(tipo, montoSeleccionado) {
		filtroSeleccionado = tipo;
		monto = montoSeleccionado.toFixed(2);
	}
	
	async function handleSubmit() {
		try {
			loading = true;
			
			const montoPago = parseFloat(monto);
			if (isNaN(montoPago) || montoPago <= 0) {
				showNotification({ type: 'error', message: 'Ingresa un monto válido' });
				return;
			}
			
			// Validar que hay créditos activos
			if (creditos.length === 0) {
				showNotification({ type: 'error', message: 'No hay créditos activos para este cliente' });
				return;
			}
			
			// Ordenar créditos por fecha (más antiguo primero)
			const creditosOrdenados = [...creditos].sort((a, b) => 
				new Date(a.fecha_desembolso) - new Date(b.fecha_desembolso)
			);
			
			let montoRestante = montoPago;
			const pagosRegistrados = [];
			const fecha = new Date().toISOString().split('T')[0];
			
			// Distribuir el pago entre múltiples créditos si es necesario
			for (const credito of creditosOrdenados) {
				if (montoRestante <= 0) break;
				
				// Calcular cuánto aplicar a este crédito
				const montoPorCredito = Math.min(montoRestante, credito.saldo_pendiente);
				
				if (montoPorCredito > 0) {
					// Registrar pago individual para este crédito
					const pago = await registrarPago({
						credito_id: credito.id,
						cliente_id: cliente.id,
						monto: montoPorCredito,
						fecha
					});
					
					pagosRegistrados.push(pago);
					montoRestante -= montoPorCredito;
					
					console.log(`💰 Pago de ${formatearMoneda(montoPorCredito)} aplicado al crédito ${credito.id}`);
				}
			}
			
			// Mostrar notificación de éxito
			if (pagosRegistrados.length === 1) {
				showNotification({ 
					type: 'success', 
					message: `Pago de ${formatearMoneda(montoPago)} registrado exitosamente` 
				});
			} else {
				showNotification({ 
					type: 'success', 
					message: `Pago de ${formatearMoneda(montoPago)} distribuido en ${pagosRegistrados.length} créditos` 
				});
			}
			
			// Cerrar modal y notificar éxito
			open = false;
			monto = '';
			preview = [];
			filtroSeleccionado = null;
			onSuccess();
			
		} catch (err) {
			console.error('Error registrando pago:', err);
			showNotification({ type: 'error', message: `Error al registrar el pago: ${err.message}` });
		} finally {
			loading = false;
		}
	}
	
	function handleClose() {
		open = false;
		monto = '';
		preview = [];
		filtroSeleccionado = null;
	}
</script>

<Modal bind:open title="Cobrar a {cliente?.nombre || 'Cliente'}" maxWidth="600px">
	<div class="modal-cobro">
		<!-- Estado actual -->
		<div class="estado-actual">
			<h3>Estado actual</h3>
			
			{#if cuotasDelDia.length > 0}
				<div class="info-row">
					<span class="label">Cuotas de hoy:</span>
					<span class="value">{formatearMoneda(montoSoloHoy)}</span>
					<span class="detail">({cuotasDelDia.length} cuotas)</span>
				</div>
			{/if}
			
			{#if cuotasVencidas.length > 0}
				<div class="info-row danger">
					<span class="label">Cuotas vencidas:</span>
					<span class="value">{formatearMoneda(montoAtrasadas)}</span>
					<span class="detail">({cuotasVencidas.length} cuotas)</span>
				</div>
			{/if}
			
			<div class="info-row total">
				<span class="label">Total adeudado:</span>
				<span class="value">{formatearMoneda(montoTodoAlDia)}</span>
			</div>
		</div>
		
		<!-- Opciones rápidas -->
		<div class="opciones-rapidas">
			<h3>Opciones rápidas</h3>
			<div class="botones-rapidos">
				{#if montoSoloHoy > 0}
					<button 
						onclick={() => seleccionarMontoRapido('hoy', montoSoloHoy)}
						class="btn-rapido"
						class:active={filtroSeleccionado === 'hoy'}
						disabled={loading}
					>
						Solo hoy<br/>
						<strong>{formatearMoneda(montoSoloHoy)}</strong>
					</button>
				{/if}
				
				{#if montoAtrasadas > 0}
					<button 
						onclick={() => seleccionarMontoRapido('atrasadas', montoAtrasadas)}
						class="btn-rapido"
						class:active={filtroSeleccionado === 'atrasadas'}
						disabled={loading}
					>
						Atrasadas<br/>
						<strong>{formatearMoneda(montoAtrasadas)}</strong>
					</button>
				{/if}
				
				{#if montoTodoAlDia > 0}
					<button 
						onclick={() => seleccionarMontoRapido('todo', montoTodoAlDia)}
						class="btn-rapido primary"
						class:active={filtroSeleccionado === 'todo'}
						disabled={loading}
					>
						Todo al día<br/>
						<strong>{formatearMoneda(montoTodoAlDia)}</strong>
					</button>
				{/if}
			</div>
		</div>
		
		<!-- Input de monto -->
		<div class="input-monto">
			<label for="monto">O ingresa otro monto:</label>
			<div class="input-wrapper">
				<span class="currency">$</span>
				<input
					id="monto"
					type="number"
					inputmode="decimal"
					bind:value={monto}
					placeholder="0.00"
					step="0.01"
					min="0"
					disabled={loading}
				/>
			</div>
		</div>
		
		<!-- Preview del pago -->
		{#if preview.length > 0}
			<div class="preview">
				<h3>Preview del pago</h3>
				<div class="preview-list">
					{#each preview as cuota}
						<div class="preview-item" class:pagada={cuota.estado_nuevo === 'PAGADA'} class:parcial={cuota.estado_nuevo === 'PARCIAL'}>
							<div class="preview-header">
								{#if cuota.estado_nuevo === 'PAGADA'}
									<span class="icon">✅</span>
								{:else if cuota.estado_nuevo === 'PARCIAL'}
									<span class="icon">🟡</span>
								{:else}
									<span class="icon">⏳</span>
								{/if}
								<span class="cuota-info">
									Cuota {cuota.numero} - Crédito {cuota.credito_numero}
								</span>
							</div>
							<div class="preview-body">
								<div class="preview-row">
									<span>Programado:</span>
									<span>{formatearMoneda(cuota.monto_programado)}</span>
								</div>
								<div class="preview-row">
									<span>Pagado antes:</span>
									<span>{formatearMoneda(cuota.monto_pagado_anterior)}</span>
								</div>
								<div class="preview-row highlight">
									<span>Pago ahora:</span>
									<span>{formatearMoneda(cuota.monto_pago_nuevo)}</span>
								</div>
								<div class="preview-row total">
									<span>Saldo restante:</span>
									<span>{formatearMoneda(cuota.saldo_nuevo)}</span>
								</div>
								<div class="preview-estado">
									<span class="estado-badge" class:pagada={cuota.estado_nuevo === 'PAGADA'} class:parcial={cuota.estado_nuevo === 'PARCIAL'}>
										{cuota.estado_nuevo}
									</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
		
		<!-- Acciones -->
		<div class="modal-actions">
			<button onclick={handleClose} class="btn-cancelar" disabled={loading}>
				Cancelar
			</button>
			<button 
				onclick={handleSubmit} 
				class="btn-registrar"
				disabled={loading || !monto || parseFloat(monto) <= 0}
			>
				{loading ? 'Registrando...' : 'Registrar Pago'}
			</button>
		</div>
	</div>
</Modal>

<style>
	.modal-cobro {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	
	h3 {
		font-size: 1rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0 0 0.75rem 0;
	}
	
	.estado-actual {
		background: #f8fafc;
		border-radius: 0.5rem;
		padding: 1rem;
	}
	
	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid #e2e8f0;
	}
	
	.info-row:last-child {
		border-bottom: none;
	}
	
	.info-row.danger {
		color: #dc2626;
	}
	
	.info-row.total {
		font-weight: 600;
		padding-top: 0.75rem;
		margin-top: 0.5rem;
		border-top: 2px solid #cbd5e1;
	}
	
	.info-row .label {
		font-size: 0.875rem;
		color: #64748b;
	}
	
	.info-row .value {
		font-size: 1rem;
		font-weight: 600;
	}
	
	.info-row .detail {
		font-size: 0.75rem;
		color: #94a3b8;
	}
	
	.botones-rapidos {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
	}
	
	.btn-rapido {
		padding: 1rem;
		border: 2px solid #e2e8f0;
		background: white;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
		color: #64748b;
		text-align: center;
	}
	
	.btn-rapido strong {
		display: block;
		margin-top: 0.25rem;
		font-size: 1rem;
		color: #1e293b;
	}
	
	.btn-rapido:hover:not(:disabled) {
		border-color: #3b82f6;
		background: #eff6ff;
	}
	
	.btn-rapido.primary {
		border-color: #3b82f6;
		background: #eff6ff;
	}
	
	.btn-rapido.primary strong {
		color: #3b82f6;
	}
	
	.btn-rapido.active {
		border-color: #3b82f6;
		background: #3b82f6;
		color: white;
	}
	
	.btn-rapido.active strong {
		color: white;
	}
	
	.btn-rapido:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.input-monto label {
		display: block;
		font-size: 0.875rem;
		color: #64748b;
		margin-bottom: 0.5rem;
	}
	
	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}
	
	.currency {
		position: absolute;
		left: 1rem;
		font-size: 1.25rem;
		color: #64748b;
		font-weight: 600;
	}
	
	.input-wrapper input {
		width: 100%;
		padding: 1rem 1rem 1rem 2.5rem;
		border: 2px solid #e2e8f0;
		border-radius: 0.5rem;
		font-size: 1.25rem;
		font-weight: 600;
	}
	
	.input-wrapper input:focus {
		outline: none;
		border-color: #3b82f6;
	}
	
	.preview {
		background: #f8fafc;
		border-radius: 0.5rem;
		padding: 1rem;
		max-height: 300px;
		overflow-y: auto;
	}
	
	.preview-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	
	.preview-item {
		background: white;
		border-radius: 0.5rem;
		padding: 0.75rem;
		border-left: 4px solid #cbd5e1;
	}
	
	.preview-item.pagada {
		border-left-color: #10b981;
	}
	
	.preview-item.parcial {
		border-left-color: #f59e0b;
	}
	
	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	
	.preview-header .icon {
		font-size: 1.25rem;
	}
	
	.preview-header .cuota-info {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1e293b;
	}
	
	.preview-body {
		font-size: 0.875rem;
	}
	
	.preview-row {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
		color: #64748b;
	}
	
	.preview-row.highlight {
		color: #3b82f6;
		font-weight: 600;
	}
	
	.preview-row.total {
		color: #1e293b;
		font-weight: 600;
		padding-top: 0.5rem;
		margin-top: 0.5rem;
		border-top: 1px solid #e2e8f0;
	}
	
	.preview-estado {
		margin-top: 0.5rem;
	}
	
	.estado-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		background: #f1f5f9;
		color: #64748b;
	}
	
	.estado-badge.pagada {
		background: #d1fae5;
		color: #065f46;
	}
	
	.estado-badge.parcial {
		background: #fef3c7;
		color: #92400e;
	}
	
	.modal-actions {
		display: flex;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 1px solid #e2e8f0;
	}
	
	.btn-cancelar, .btn-registrar {
		flex: 1;
		padding: 0.875rem;
		border: none;
		border-radius: 0.5rem;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.btn-cancelar {
		background: #f1f5f9;
		color: #475569;
	}
	
	.btn-cancelar:hover:not(:disabled) {
		background: #e2e8f0;
	}
	
	.btn-registrar {
		background: #3b82f6;
		color: white;
	}
	
	.btn-registrar:hover:not(:disabled) {
		background: #2563eb;
	}
	
	.btn-registrar:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
