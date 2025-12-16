<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db } from '$lib/db/local.js';
	import { getCuotasDelDia, getCuotasVencidas } from '$lib/sync/cuotas.js';
	import { syncCounter, isOnline } from '$lib/stores/sync.js';
	import { formatearMoneda, formatearFecha } from '$lib/utils/creditos.js';
	import ModalCobrarRapido from '$lib/components/ModalCobrarRapido.svelte';
	
	let clientes = $state([]);
	let searchQuery = $state('');
	let loading = $state(true);
	let ordenPersonalizado = $state([]);
	let modalCobrarOpen = $state(false);
	let clienteSeleccionado = $state(null);
	
	// Estadísticas del día
	let estadisticas = $state({
		recaudoEsperado: 0,
		numeroCuotasEsperadas: 0,
		creditosOtorgadosHoy: 0,
		montoOtorgadoHoy: 0,
		montoVencido: 0,
		clientesEnMora: 0
	});
	
	// Filtrar clientes por búsqueda
	let clientesFiltrados = $derived(
		clientes.filter(c => 
			c.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			c.numero_documento?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			c.telefono?.includes(searchQuery)
		)
	);
	
	// Recargar cuando sincroniza
	let lastSyncCount = $state(0);
	$effect(() => {
		if ($syncCounter !== lastSyncCount && !loading) {
			lastSyncCount = $syncCounter;
			cargarDatos();
		}
	});
	
	onMount(async () => {
		await cargarDatos();
		cargarOrdenPersonalizado();
	});
	
	async function cargarDatos() {
		try {
			loading = true;
			const hoy = new Date().toISOString().split('T')[0];
			
			// Obtener cuotas del día
			const cuotasHoy = await getCuotasDelDia(hoy);
			
			// Obtener cuotas vencidas
			const cuotasVencidas = await getCuotasVencidas();
			
			// Combinar cuotas (del día + vencidas)
			const todasLasCuotas = [...cuotasHoy, ...cuotasVencidas];
			
			// Agrupar por cliente
			const clientesMap = new Map();
			
			for (const cuota of todasLasCuotas) {
				// Obtener crédito
				const credito = await db.creditos.get(cuota.credito_id);
				if (!credito) continue;
				
				// Obtener cliente
				const cliente = await db.clientes.get(credito.cliente_id);
				if (!cliente) continue;
				
				if (!clientesMap.has(cliente.id)) {
					clientesMap.set(cliente.id, {
						...cliente,
						cuotasDelDia: [],
						cuotasVencidas: [],
						montoDelDia: 0,
						montoVencido: 0,
						diasAtrasoMax: 0
					});
				}
				
				const clienteData = clientesMap.get(cliente.id);
				
				if (cuota.fecha_programada === hoy && cuota.estado !== 'PAGADA') {
					clienteData.cuotasDelDia.push(cuota);
					clienteData.montoDelDia += cuota.saldo_pendiente;
				} else if (cuota.fecha_programada < hoy && cuota.estado !== 'PAGADA') {
					clienteData.cuotasVencidas.push(cuota);
					clienteData.montoVencido += cuota.saldo_pendiente;
					clienteData.diasAtrasoMax = Math.max(clienteData.diasAtrasoMax, cuota.dias_atraso);
				}
			}
			
			clientes = Array.from(clientesMap.values());
			
			// Calcular estadísticas
			await calcularEstadisticas(hoy);
			
			// Aplicar orden personalizado si existe
			aplicarOrdenPersonalizado();
			
		} catch (err) {
			console.error('Error cargando datos de ruta:', err);
		} finally {
			loading = false;
		}
	}
	
	async function calcularEstadisticas(hoy) {
		try {
			// Recaudo esperado del día
			const cuotasHoy = await getCuotasDelDia(hoy);
			const recaudoEsperado = cuotasHoy
				.filter(c => c.estado !== 'PAGADA')
				.reduce((sum, c) => sum + c.saldo_pendiente, 0);
			const numeroCuotasEsperadas = cuotasHoy.filter(c => c.estado !== 'PAGADA').length;
			
			// Créditos otorgados hoy
			const creditosHoy = await db.creditos
				.where('fecha_desembolso')
				.equals(hoy)
				.toArray();
			const creditosOtorgadosHoy = creditosHoy.length;
			const montoOtorgadoHoy = creditosHoy.reduce((sum, c) => sum + c.monto_original, 0);
			
			// Montos vencidos
			const cuotasVencidas = await getCuotasVencidas();
			const montoVencido = cuotasVencidas.reduce((sum, c) => sum + c.saldo_pendiente, 0);
			const clientesEnMora = new Set(cuotasVencidas.map(c => c.credito_id)).size;
			
			estadisticas = {
				recaudoEsperado,
				numeroCuotasEsperadas,
				creditosOtorgadosHoy,
				montoOtorgadoHoy,
				montoVencido,
				clientesEnMora
			};
		} catch (err) {
			console.error('Error calculando estadísticas:', err);
		}
	}
	
	function cargarOrdenPersonalizado() {
		const ordenGuardado = localStorage.getItem('orden-mi-ruta');
		if (ordenGuardado) {
			try {
				ordenPersonalizado = JSON.parse(ordenGuardado);
			} catch (err) {
				console.error('Error cargando orden:', err);
			}
		}
	}
	
	function aplicarOrdenPersonalizado() {
		if (ordenPersonalizado.length === 0) {
			// Orden por defecto: mora primero, luego por monto descendente
			clientes.sort((a, b) => {
				if (a.diasAtrasoMax > 0 && b.diasAtrasoMax === 0) return -1;
				if (a.diasAtrasoMax === 0 && b.diasAtrasoMax > 0) return 1;
				return (b.montoDelDia + b.montoVencido) - (a.montoDelDia + a.montoVencido);
			});
		} else {
			// Aplicar orden personalizado
			clientes.sort((a, b) => {
				const indexA = ordenPersonalizado.indexOf(a.id);
				const indexB = ordenPersonalizado.indexOf(b.id);
				if (indexA === -1 && indexB === -1) return 0;
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;
				return indexA - indexB;
			});
		}
	}
	
	function guardarOrdenPersonalizado() {
		const orden = clientes.map(c => c.id);
		localStorage.setItem('orden-mi-ruta', JSON.stringify(orden));
		ordenPersonalizado = orden;
	}
	
	function restablecerOrden() {
		localStorage.removeItem('orden-mi-ruta');
		ordenPersonalizado = [];
		aplicarOrdenPersonalizado();
	}
	
	// Drag and drop
	let draggedIndex = $state(null);
	let draggedElement = $state(null);
	
	function handleDragStart(event, index) {
		draggedIndex = index;
		draggedElement = event.currentTarget;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/html', event.currentTarget.innerHTML);
		
		// Agregar clase visual
		setTimeout(() => {
			if (draggedElement) {
				draggedElement.classList.add('dragging');
			}
		}, 0);
	}
	
	function handleDragOver(event, index) {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		
		if (draggedIndex === null || draggedIndex === index) return;
		
		// Reordenar array original (no el filtrado)
		const newClientes = [...clientes];
		
		// Encontrar los índices reales en el array original
		const draggedClienteId = clientesFiltrados[draggedIndex].id;
		const targetClienteId = clientesFiltrados[index].id;
		
		const realDraggedIndex = newClientes.findIndex(c => c.id === draggedClienteId);
		const realTargetIndex = newClientes.findIndex(c => c.id === targetClienteId);
		
		// Reordenar
		const draggedItem = newClientes[realDraggedIndex];
		newClientes.splice(realDraggedIndex, 1);
		newClientes.splice(realTargetIndex, 0, draggedItem);
		
		// Actualizar
		clientes = newClientes;
		draggedIndex = index;
	}
	
	function handleDragEnd(event) {
		if (draggedElement) {
			draggedElement.classList.remove('dragging');
		}
		draggedIndex = null;
		draggedElement = null;
		guardarOrdenPersonalizado();
	}
	
	function handleDragEnter(event, index) {
		event.preventDefault();
		if (draggedIndex !== null && draggedIndex !== index) {
			event.currentTarget.classList.add('drag-over');
		}
	}
	
	function handleDragLeave(event) {
		event.currentTarget.classList.remove('drag-over');
	}
	
	function handleDrop(event, index) {
		event.preventDefault();
		event.currentTarget.classList.remove('drag-over');
	}
	
	function verCliente(clienteId) {
		goto(`/clientes/${clienteId}`);
	}
	
	function cobrarCliente(cliente) {
		clienteSeleccionado = cliente;
		modalCobrarOpen = true;
	}
	
	function handleCobroExitoso() {
		// Recargar datos después de cobrar
		cargarDatos();
	}
</script>

<div class="ruta-page">
	<!-- Header -->
	<div class="header">
		<h1>Mi Ruta</h1>
		{#if $isOnline}
			<span class="badge-online">En línea</span>
		{:else}
			<span class="badge-offline">Sin conexión</span>
		{/if}
	</div>
	
	<!-- Estadísticas -->
	<div class="estadisticas">
		<div class="stat-card">
			<div class="stat-label">Recaudo Esperado</div>
			<div class="stat-value">{formatearMoneda(estadisticas.recaudoEsperado)}</div>
			<div class="stat-detail">{estadisticas.numeroCuotasEsperadas} cuotas</div>
		</div>
		
		<div class="stat-card">
			<div class="stat-label">Créditos Otorgados Hoy</div>
			<div class="stat-value">{formatearMoneda(estadisticas.montoOtorgadoHoy)}</div>
			<div class="stat-detail">{estadisticas.creditosOtorgadosHoy} créditos</div>
		</div>
		
		<div class="stat-card danger">
			<div class="stat-label">Montos Vencidos</div>
			<div class="stat-value">{formatearMoneda(estadisticas.montoVencido)}</div>
			<div class="stat-detail">{estadisticas.clientesEnMora} clientes</div>
		</div>
	</div>
	
	<!-- Buscador y controles -->
	<div class="controles">
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="Buscar cliente..."
			class="search-input"
		/>
		
		{#if ordenPersonalizado.length > 0}
			<button onclick={restablecerOrden} class="btn-restablecer">
				Restablecer Orden
			</button>
		{/if}
	</div>
	
	<!-- Lista de clientes -->
	{#if loading}
		<div class="loading">
			<p>Cargando ruta...</p>
		</div>
	{:else if clientesFiltrados.length === 0}
		<div class="empty">
			<p>No hay clientes con cuotas pendientes hoy</p>
		</div>
	{:else}
		<div class="clientes-list">
			{#each clientesFiltrados as cliente, index (cliente.id)}
				<div
					class="cliente-card"
					class:en-mora={cliente.diasAtrasoMax > 0}
					draggable="true"
					ondragstart={(e) => handleDragStart(e, index)}
					ondragover={(e) => handleDragOver(e, index)}
					ondragend={(e) => handleDragEnd(e)}
					ondragenter={(e) => handleDragEnter(e, index)}
					ondragleave={(e) => handleDragLeave(e)}
					ondrop={(e) => handleDrop(e, index)}
				>
					<div class="card-header">
						<h3>{cliente.nombre}</h3>
						{#if cliente.diasAtrasoMax > 0}
							<span class="badge-mora">
								⚠️ {cliente.diasAtrasoMax} días atraso
							</span>
						{/if}
					</div>
					
					<div class="card-body">
						{#if cliente.cuotasDelDia.length > 0}
							<div class="info-row">
								<span class="label">Cuotas hoy:</span>
								<span class="value">{formatearMoneda(cliente.montoDelDia)}</span>
								<span class="detail">({cliente.cuotasDelDia.length})</span>
							</div>
						{/if}
						
						{#if cliente.cuotasVencidas.length > 0}
							<div class="info-row danger">
								<span class="label">Vencidas:</span>
								<span class="value">{formatearMoneda(cliente.montoVencido)}</span>
								<span class="detail">({cliente.cuotasVencidas.length})</span>
							</div>
						{/if}
					</div>
					
					<div class="card-actions">
						<button onclick={() => verCliente(cliente.id)} class="btn-ver">
							Ver Cliente
						</button>
						<button onclick={() => cobrarCliente(cliente)} class="btn-cobrar">
							Cobrar
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Modal de cobro rápido -->
{#if clienteSeleccionado}
	<ModalCobrarRapido 
		bind:open={modalCobrarOpen}
		cliente={clienteSeleccionado}
		cuotasDelDia={clienteSeleccionado.cuotasDelDia || []}
		cuotasVencidas={clienteSeleccionado.cuotasVencidas || []}
		onSuccess={handleCobroExitoso}
	/>
{/if}

<style>
	.ruta-page {
		min-height: 100vh;
		background: #f8fafc;
		padding: 1rem;
		padding-bottom: 100px;
	}
	
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}
	
	.header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0;
	}
	
	.badge-online {
		background: #10b981;
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 500;
	}
	
	.badge-offline {
		background: #ef4444;
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 500;
	}
	
	.estadisticas {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	
	.stat-card {
		background: white;
		border-radius: 0.5rem;
		padding: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	
	.stat-card.danger {
		border-left: 4px solid #ef4444;
	}
	
	.stat-label {
		font-size: 0.75rem;
		color: #64748b;
		margin-bottom: 0.5rem;
	}
	
	.stat-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1e293b;
		margin-bottom: 0.25rem;
	}
	
	.stat-detail {
		font-size: 0.75rem;
		color: #94a3b8;
	}
	
	.controles {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	
	.search-input {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #e2e8f0;
		border-radius: 0.5rem;
		font-size: 1rem;
	}
	
	.btn-restablecer {
		padding: 0.75rem 1rem;
		background: #64748b;
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
	}
	
	.loading, .empty {
		text-align: center;
		padding: 3rem 1rem;
		color: #64748b;
	}
	
	.clientes-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	
	.cliente-card {
		background: white;
		border-radius: 0.5rem;
		padding: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		cursor: move;
		transition: all 0.2s;
	}
	
	.cliente-card.en-mora {
		border-left: 4px solid #ef4444;
	}
	
	.cliente-card.dragging {
		opacity: 0.5;
		transform: scale(0.95);
	}
	
	.cliente-card.drag-over {
		border-top: 3px solid #3b82f6;
		margin-top: 0.5rem;
	}
	
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	
	.card-header h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0;
	}
	
	.badge-mora {
		background: #fef2f2;
		color: #dc2626;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 500;
	}
	
	.card-body {
		margin-bottom: 0.75rem;
	}
	
	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid #f1f5f9;
	}
	
	.info-row:last-child {
		border-bottom: none;
	}
	
	.info-row.danger {
		color: #dc2626;
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
	
	.card-actions {
		display: flex;
		gap: 0.5rem;
	}
	
	.btn-ver, .btn-cobrar {
		flex: 1;
		padding: 0.75rem;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}
	
	.btn-ver {
		background: #f1f5f9;
		color: #475569;
	}
	
	.btn-cobrar {
		background: #3b82f6;
		color: white;
	}
</style>
