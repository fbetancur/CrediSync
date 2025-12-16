<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { db } from '$lib/db/local.js';
	import { getCreditosCliente } from '$lib/sync/creditos.js';
	import { getCuotasCredito, getCuotasDelDia, getCuotasVencidas } from '$lib/sync/cuotas.js';
	import { syncCounter } from '$lib/stores/sync.js';
	import {
		formatearMoneda,
		formatearFecha
	} from '$lib/utils/creditos.js';
	import ModalCobrarRapido from '$lib/components/ModalCobrarRapido.svelte';
	
	const clienteId = $derived($page.params.id);
	
	let cliente = $state(null);
	let creditosActivos = $state([]);
	let loading = $state(true);
	let creditoExpandido = $state(null);
	let modalCobrarOpen = $state(false);
	let cuotasDelDia = $state([]);
	let cuotasVencidas = $state([]);
	
	// ✅ Estados ya calculados en IndexedDB
	let creditosConEstado = $state([]);
	let estadoFinanciero = $state({
		totalCreditos: 0,
		saldoTotal: 0,
		estado: 'SIN_CREDITOS',
		diasAtraso: 0,
		score: 'REGULAR'
	});
	
	// Recargar cuando cambie el contador de sincronización
	let lastSyncCount = $state(0);
	$effect(() => {
		if ($syncCounter !== lastSyncCount && !loading && cliente) {
			lastSyncCount = $syncCounter;
			cargarDatos();
		}
	});
	
	onMount(async () => {
		await cargarDatos();
	});
	
	async function cargarDatos() {
		try {
			loading = true;
			
			// Cargar cliente
			cliente = await db.clientes.get(clienteId);
			
			if (!cliente) {
				goto('/clientes');
				return;
			}
			
			// Cargar créditos activos (ya tienen estados calculados en IndexedDB)
			try {
				creditosActivos = await getCreditosCliente(clienteId);
			} catch (err) {
				console.log('Tabla creditos no existe aún:', err);
				creditosActivos = [];
			}
			
			// ✅ Los créditos YA tienen estados calculados en IndexedDB
			// No necesitamos cargar pagos ni calcular nada
			creditosConEstado = creditosActivos;
			
			// ✅ El cliente YA tiene estado financiero calculado en IndexedDB
			estadoFinanciero = {
				totalCreditos: cliente.creditos_activos || 0,
				saldoTotal: cliente.saldo_total || 0,
				estado: cliente.estado || 'SIN_CREDITOS',
				diasAtraso: cliente.dias_atraso_max || 0,
				score: cliente.score || 'REGULAR'
			};
			
		} catch (err) {
			console.error('Error cargando datos:', err);
		} finally {
			loading = false;
		}
	}
	
	function volver() {
		goto('/clientes');
	}
	
	function otorgarCredito() {
		goto(`/clientes/${clienteId}/otorgar-credito`);
	}
	
	async function registrarPago() {
		// Cargar cuotas del día y vencidas para el modal
		try {
			const todasLasCuotasDelDia = [];
			const todasLasCuotasVencidas = [];
			
			for (const credito of creditosActivos) {
				const cuotasDia = await getCuotasDelDia(credito.id);
				const cuotasVenc = await getCuotasVencidas(credito.id);
				todasLasCuotasDelDia.push(...cuotasDia);
				todasLasCuotasVencidas.push(...cuotasVenc);
			}
			
			cuotasDelDia = todasLasCuotasDelDia;
			cuotasVencidas = todasLasCuotasVencidas;
			modalCobrarOpen = true;
		} catch (err) {
			console.error('Error cargando cuotas:', err);
		}
	}
	
	function handleCobroExitoso() {
		cargarDatos(); // Recargar datos después del cobro
	}
	
	function toggleCuotas(creditoId) {
		creditoExpandido = creditoExpandido === creditoId ? null : creditoId;
	}
	
	function editarCliente() {
		goto(`/clientes/${clienteId}/editar`);
	}
	
	function verHistorial() {
		// TODO: Implementar página de historial
		alert('Historial completo próximamente');
	}
	
	function getIconoEstadoCuota(estado) {
		switch (estado) {
			case 'PAGADA': return '🟢';
			case 'PARCIAL': return '🟡';
			case 'PENDIENTE': return '⚪';
			default: return '⚪';
		}
	}
	
	function getClaseEstadoCuota(cuota) {
		if (cuota.estado === 'PAGADA') return 'pagada';
		if (cuota.dias_atraso > 0) return 'atrasada';
		if (cuota.estado === 'PARCIAL') return 'parcial';
		return 'pendiente';
	}
</script>

{#if loading}
	<div class="loading-container">
		<p>Cargando...</p>
	</div>
{:else if cliente}
	<div class="detalle-page">
		<!-- Header -->
		<div class="header">
			<button onclick={volver} class="btn-back">
				← Volver
			</button>
			<button onclick={otorgarCredito} class="btn-otorgar">
				+ Otorgar Crédito
			</button>
		</div>
		
		<!-- Información del Cliente -->
		<div class="cliente-header">
			<h1>{cliente.nombre}</h1>
			<div class="cliente-contacto">
				<span>📄 {cliente.tipo_documento}: {cliente.numero_documento}</span>
				<span>📞 {cliente.telefono}</span>
				{#if cliente.telefono_2}
					<span>📞 {cliente.telefono_2}</span>
				{/if}
			</div>
			<div class="cliente-direccion">
				<span>📍 {cliente.direccion}</span>
				{#if cliente.barrio}
					<span>, {cliente.barrio}</span>
				{/if}
			</div>
			{#if cliente.referencia}
				<div class="cliente-referencia">
					<span>Ref: {cliente.referencia}</span>
				</div>
			{/if}
		</div>
		
		<!-- Estado Financiero -->
		<div class="estado-financiero">
			<h2>ESTADO FINANCIERO</h2>
			<div class="estado-grid">
				<div class="estado-item">
					<span class="estado-label">Créditos Activos</span>
					<span class="estado-value">{estadoFinanciero.totalCreditos}</span>
				</div>
				<div class="estado-item">
					<span class="estado-label">Saldo Total</span>
					<span class="estado-value">{formatearMoneda(estadoFinanciero.saldoTotal)}</span>
				</div>
			</div>
			<div class="estado-grid">
				<div class="estado-item">
					<span class="estado-label">Estado</span>
					<span class="estado-badge {estadoFinanciero.estado.toLowerCase()}">
						{estadoFinanciero.estado.replace('_', ' ')}
					</span>
					{#if estadoFinanciero.diasAtraso > 0}
						<span class="dias-atraso">⚠️ {estadoFinanciero.diasAtraso} días de atraso</span>
					{/if}
				</div>
				<div class="estado-item">
					<span class="estado-label">Score</span>
					<span class="score-badge {estadoFinanciero.score.toLowerCase()}">
						{estadoFinanciero.score}
					</span>
				</div>
			</div>
		</div>
		
		<!-- Créditos Activos -->
		<div class="creditos-section">
			<h2>CRÉDITOS ACTIVOS ({creditosActivos.length})</h2>
			
			{#if creditosConEstado.length === 0}
				<p class="empty-state">No hay créditos activos</p>
			{:else}
				{#each creditosConEstado as credito (credito.id)}
					<div class="credito-card {credito.dias_atraso > 0 ? 'mora' : 'al_dia'}">
						<div class="credito-header">
							<span class="credito-monto">{formatearMoneda(credito.total_a_pagar)}</span>
							<span class="credito-estado {credito.dias_atraso > 0 ? 'mora' : 'al_dia'}">
								{credito.dias_atraso > 0 ? '🔴 MORA' : '🟢 AL DÍA'}
							</span>
						</div>
						<div class="credito-info">
							<span>{credito.frecuencia} • {credito.numero_cuotas} cuotas</span>
						</div>
						<div class="credito-detalles">
							<div class="detalle-item">
								<span class="detalle-label">Saldo</span>
								<span class="detalle-value">{formatearMoneda(credito.saldo_pendiente)}</span>
							</div>
							<div class="detalle-item">
								<span class="detalle-label">Pagadas</span>
								<span class="detalle-value">{credito.cuotas_pagadas}/{credito.numero_cuotas}</span>
							</div>
							<div class="detalle-item">
								<span class="detalle-label">Desembolso</span>
								<span class="detalle-value">{formatearFecha(credito.fecha_desembolso)}</span>
							</div>
						</div>
						{#if credito.dias_atraso > 0}
							<div class="credito-alerta">
								⚠️ {credito.dias_atraso} días de atraso
							</div>
						{/if}
						<div class="credito-acciones">
							<button onclick={() => toggleCuotas(credito.id)} class="btn-secundario">
								{creditoExpandido === credito.id ? '▼' : '▶'} Ver Cuotas
							</button>
							<button onclick={registrarPago} class="btn-primario">
								Registrar Pago
							</button>
						</div>
						
						<!-- Tabla de Cuotas Expandible -->
						{#if creditoExpandido === credito.id}
							{#await getCuotasCredito(credito.id) then cuotasCalculadas}
							<div class="cuotas-expandidas">
								<div class="cuotas-header">
									<h4>Detalle de Cuotas</h4>
								</div>
								<div class="cuotas-tabla">
									<table>
										<thead>
											<tr>
												<th>#</th>
												<th>Fecha</th>
												<th>Monto</th>
												<th>Pagado</th>
												<th>Estado</th>
											</tr>
										</thead>
										<tbody>
											{#each cuotasCalculadas as cuota (cuota.numero)}
												<tr class={getClaseEstadoCuota(cuota)}>
													<td>{cuota.numero}</td>
													<td>{formatearFecha(cuota.fecha_programada)}</td>
													<td>{formatearMoneda(cuota.monto_programado)}</td>
													<td>{formatearMoneda(cuota.monto_pagado)}</td>
													<td>
														<span class="estado-cuota {getClaseEstadoCuota(cuota)}">
															{getIconoEstadoCuota(cuota.estado)} {cuota.estado}
															{#if cuota.dias_atraso > 0}
																<span class="dias-atraso-cuota">({cuota.dias_atraso}d)</span>
															{/if}
														</span>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
							{/await}
						{/if}
					</div>
				{/each}
			{/if}
		</div>
		
		<!-- Acciones Inferiores -->
		<div class="acciones-inferiores">
			<button onclick={editarCliente} class="btn-accion">
				Editar Cliente
			</button>
			<button onclick={verHistorial} class="btn-accion">
				Ver Historial
			</button>
		</div>
	</div>
{:else}
	<div class="error-container">
		<p>Cliente no encontrado</p>
		<button onclick={volver} class="btn-primario">Volver</button>
	</div>
{/if}

<!-- Modal de Cobro Rápido -->
{#if cliente}
	<ModalCobrarRapido 
		bind:open={modalCobrarOpen}
		cliente={cliente}
		cuotasDelDia={cuotasDelDia}
		cuotasVencidas={cuotasVencidas}
		onSuccess={handleCobroExitoso}
	/>
{/if}

<style>
	.detalle-page {
		min-height: 100%;
		background: #f8fafc;
		padding-top: 0; /* Sin padding superior para que el header sticky funcione */
	}
	
	/* Header */
	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: linear-gradient(180deg, #eef2ff 0%, #ffffff 100%);
		border-bottom: 1px solid #c7d2fe;
		box-shadow: 0 2px 6px rgba(79, 70, 229, 0.1);
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
	
	.btn-back:hover {
		background: #f8fafc;
		border-color: #4f46e5;
	}
	
	.btn-otorgar {
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
		font-size: 0.875rem;
	}
	
	.btn-otorgar:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
	}
	
	/* Información del Cliente */
	.cliente-header {
		padding: 1rem 1rem 1.5rem 1rem; /* Menos padding arriba, más abajo */
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}
	
	.cliente-header h1 {
		margin: 0 0 0.75rem 0;
		font-size: 1.375rem; /* Ligeramente más pequeño para que quepa */
		color: #1e293b;
		line-height: 1.3;
	}
	
	.cliente-contacto {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		font-size: 0.9375rem;
		color: #64748b;
	}
	
	.cliente-direccion {
		font-size: 0.9375rem;
		color: #64748b;
		margin-bottom: 0.5rem;
	}
	
	.cliente-referencia {
		font-size: 0.875rem;
		color: #94a3b8;
		font-style: italic;
	}
	
	/* Estado Financiero */
	.estado-financiero {
		padding: 1.5rem 1rem;
		background: white;
		margin-bottom: 1rem;
	}
	
	.estado-financiero h2 {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		font-weight: 700;
		color: #64748b;
		letter-spacing: 0.05em;
	}
	
	.estado-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.estado-grid:last-child {
		margin-bottom: 0;
	}
	
	.estado-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	
	.estado-label {
		font-size: 0.875rem;
		color: #94a3b8;
	}
	
	.estado-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1e293b;
	}
	
	.estado-badge {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		border-radius: 12px;
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	
	.estado-badge.al_dia {
		background: #e8f5e9;
		color: #2e7d32;
	}
	
	.estado-badge.en_mora {
		background: #ffebee;
		color: #c62828;
	}
	
	.estado-badge.sin_creditos {
		background: #f5f5f5;
		color: #666;
	}
	
	.dias-atraso {
		font-size: 0.875rem;
		color: #c62828;
		font-weight: 600;
		margin-top: 0.25rem;
	}
	
	.score-badge {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		border-radius: 12px;
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	
	.score-badge.confiable {
		background: #e8f5e9;
		color: #2e7d32;
	}
	
	.score-badge.regular {
		background: #fff9c4;
		color: #f57f17;
	}
	
	.score-badge.riesgoso {
		background: #ffebee;
		color: #c62828;
	}
	
	/* Créditos Activos */
	.creditos-section {
		padding: 1rem;
	}
	
	.creditos-section h2 {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		font-weight: 700;
		color: #64748b;
		letter-spacing: 0.05em;
	}
	
	.credito-card {
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1rem;
		transition: all 0.2s;
	}
	
	.credito-card.al_dia {
		border-color: #a5d6a7;
		background: #f1f8f4;
	}
	
	.credito-card.mora {
		border-color: #ef9a9a;
		background: #fff5f5;
	}
	
	.credito-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	
	.credito-monto {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1e293b;
	}
	
	.credito-estado {
		padding: 0.375rem 0.875rem;
		border-radius: 12px;
		font-size: 0.875rem;
		font-weight: 700;
	}
	
	.credito-estado.al_dia {
		background: #e8f5e9;
		color: #2e7d32;
	}
	
	.credito-estado.mora {
		background: #ffebee;
		color: #c62828;
	}
	
	.credito-info {
		font-size: 0.9375rem;
		color: #64748b;
		margin-bottom: 0.75rem;
	}
	
	.credito-detalles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	
	.detalle-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	
	.detalle-label {
		font-size: 0.75rem;
		color: #94a3b8;
	}
	
	.detalle-value {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #1e293b;
	}
	
	.credito-alerta {
		padding: 0.5rem;
		background: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 6px;
		color: #856404;
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}
	
	.credito-acciones {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	
	.btn-secundario {
		padding: 0.75rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		color: #64748b;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.btn-secundario:hover {
		background: #f8fafc;
		border-color: #4f46e5;
		color: #4f46e5;
	}
	
	.btn-primario {
		padding: 0.75rem;
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
	
	/* Acciones Inferiores */
	.acciones-inferiores {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		padding: 1rem;
		background: white;
		border-top: 1px solid #e5e7eb;
	}
	
	.btn-accion {
		padding: 0.875rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		color: #4f46e5;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.btn-accion:hover {
		background: #f8fafc;
		border-color: #4f46e5;
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
	
	.empty-state {
		text-align: center;
		padding: 2rem;
		color: #94a3b8;
	}
	
	/* Cuotas Expandidas */
	.cuotas-expandidas {
		margin-top: 1rem;
		border-top: 2px solid #e5e7eb;
		padding-top: 1rem;
		animation: slideDown 0.2s ease-out;
	}
	
	@keyframes slideDown {
		from {
			opacity: 0;
			max-height: 0;
		}
		to {
			opacity: 1;
			max-height: 500px;
		}
	}
	
	.cuotas-header {
		margin-bottom: 0.75rem;
	}
	
	.cuotas-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 700;
		color: #64748b;
		letter-spacing: 0.05em;
	}
	
	.cuotas-tabla {
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}
	
	.cuotas-tabla table {
		width: 100%;
		border-collapse: collapse;
		background: white;
	}
	
	.cuotas-tabla thead {
		position: sticky;
		top: 0;
		background: #f8fafc;
		z-index: 1;
	}
	
	.cuotas-tabla th {
		padding: 0.625rem 0.5rem;
		text-align: left;
		font-size: 0.75rem;
		font-weight: 600;
		color: #64748b;
		border-bottom: 2px solid #e5e7eb;
	}
	
	.cuotas-tabla td {
		padding: 0.625rem 0.5rem;
		font-size: 0.8125rem;
		color: #1e293b;
		border-bottom: 1px solid #f1f5f9;
	}
	
	.cuotas-tabla tbody tr.pagada {
		background: #f0fdf4;
	}
	
	.cuotas-tabla tbody tr.parcial {
		background: #fffbeb;
	}
	
	.cuotas-tabla tbody tr.atrasada {
		background: #fef2f2;
	}
	
	.cuotas-tabla tbody tr.pendiente {
		background: white;
	}
	
	.estado-cuota {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
	}
	
	.estado-cuota.pagada {
		background: #dcfce7;
		color: #166534;
	}
	
	.estado-cuota.parcial {
		background: #fef3c7;
		color: #92400e;
	}
	
	.estado-cuota.atrasada {
		background: #fee2e2;
		color: #991b1b;
	}
	
	.estado-cuota.pendiente {
		background: #f1f5f9;
		color: #475569;
	}
	
	.dias-atraso-cuota {
		font-size: 0.6875rem;
		opacity: 0.8;
	}
</style>
