<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db } from '$lib/db/local.js';
	import { syncCounter } from '$lib/stores/sync.js';
	import { formatearMoneda } from '$lib/utils/creditos.js';
	import { calcularResumenCliente, determinarEstadoCliente } from '$lib/utils/cobros.js';
	import ClienteCardCompacta from '$lib/components/ClienteCardCompacta.svelte';
	import ModalCobroInteligente from '$lib/components/ModalCobroInteligente.svelte';
	
	let clientes = $state([]);
	let searchQuery = $state('');
	let loading = $state(true);
	let modalCobroOpen = $state(false);
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
	});
	
	/**
	 * Cargar datos optimizado: Solo resúmenes, no cuotas individuales
	 */
	async function cargarDatos() {
		try {
			loading = true;
			const hoy = new Date().toISOString().split('T')[0];
			
			console.time('⚡ Carga de Mi Ruta');
			
			// Obtener todos los clientes con créditos activos
			const todosLosClientes = await db.clientes.toArray();
			const clientesConDatos = [];
			
			for (const cliente of todosLosClientes) {
				// Calcular resumen del cliente (optimizado)
				const resumen = await calcularResumenCliente(cliente.id);
				
				// Solo incluir clientes con créditos activos o deuda
				if (resumen.creditos_activos > 0 || resumen.total_adeudado > 0) {
					clientesConDatos.push({
						...cliente,
						resumen,
						estado: determinarEstadoCliente(resumen),
						creditos: resumen.creditos
					});
				}
			}
			
			clientes = clientesConDatos;
			
			// Ordenar por prioridad (mora primero)
			ordenarClientes();
			
			// Calcular estadísticas
			await calcularEstadisticas(hoy);
			
			console.timeEnd('⚡ Carga de Mi Ruta');
			
		} catch (err) {
			console.error('Error cargando datos de ruta:', err);
		} finally {
			loading = false;
		}
	}
	
	function ordenarClientes() {
		clientes.sort((a, b) => {
			// Prioridad 1: Clientes en mora
			if (a.estado === 'MORA' && b.estado !== 'MORA') return -1;
			if (a.estado !== 'MORA' && b.estado === 'MORA') return 1;
			
			// Prioridad 2: Mayor deuda
			if (a.resumen.total_adeudado !== b.resumen.total_adeudado) {
				return b.resumen.total_adeudado - a.resumen.total_adeudado;
			}
			
			// Prioridad 3: Más días de atraso
			return b.resumen.dias_atraso_max - a.resumen.dias_atraso_max;
		});
	}
	
	async function calcularEstadisticas(hoy) {
		try {
			// Recaudo esperado (suma de todos los adeudados)
			const recaudoEsperado = clientes.reduce((sum, c) => sum + c.resumen.total_adeudado, 0);
			const numeroCuotasEsperadas = clientes.reduce((sum, c) => sum + c.resumen.cuotas_atrasadas, 0);
			
			// Créditos otorgados hoy
			const creditosHoy = await db.creditos
				.where('fecha_desembolso')
				.equals(hoy)
				.toArray();
			const creditosOtorgadosHoy = creditosHoy.length;
			const montoOtorgadoHoy = creditosHoy.reduce((sum, c) => sum + c.monto_original, 0);
			
			// Montos vencidos y clientes en mora
			const montoVencido = clientes
				.filter(c => c.estado === 'MORA')
				.reduce((sum, c) => sum + c.resumen.total_adeudado, 0);
			const clientesEnMora = clientes.filter(c => c.estado === 'MORA').length;
			
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
	
	function handleCobrar(cliente) {
		clienteSeleccionado = cliente;
		modalCobroOpen = true;
	}
	
	function handleVerDetalles(cliente) {
		goto(`/clientes/${cliente.id}`);
	}
	
	function handleCobroExitoso() {
		// Recargar datos después de un cobro exitoso
		cargarDatos();
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header con Estadísticas -->
	<div class="bg-white border-b border-gray-200 sticky top-0 z-10">
		<div class="max-w-7xl mx-auto px-4 py-4">
			<h1 class="text-2xl font-bold text-gray-900 mb-4">📍 Mi Ruta</h1>
			
			<!-- Estadísticas en Grid -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
				<div class="bg-blue-50 rounded-lg p-3">
					<div class="text-2xl font-bold text-blue-900">
						{formatearMoneda(estadisticas.recaudoEsperado)}
					</div>
					<div class="text-xs text-blue-700">
						{estadisticas.numeroCuotasEsperadas} cuotas
					</div>
				</div>
				
				<div class="bg-green-50 rounded-lg p-3">
					<div class="text-2xl font-bold text-green-900">
						{formatearMoneda(estadisticas.montoOtorgadoHoy)}
					</div>
					<div class="text-xs text-green-700">
						{estadisticas.creditosOtorgadosHoy} créditos hoy
					</div>
				</div>
				
				<div class="bg-red-50 rounded-lg p-3">
					<div class="text-2xl font-bold text-red-900">
						{formatearMoneda(estadisticas.montoVencido)}
					</div>
					<div class="text-xs text-red-700">
						Montos vencidos
					</div>
				</div>
				
				<div class="bg-yellow-50 rounded-lg p-3">
					<div class="text-2xl font-bold text-yellow-900">
						{estadisticas.clientesEnMora}
					</div>
					<div class="text-xs text-yellow-700">
						Clientes en mora
					</div>
				</div>
			</div>
			
			<!-- Buscador -->
			<div class="relative">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Buscar cliente..."
					class="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
				<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
					🔍
				</span>
			</div>
		</div>
	</div>
	
	<!-- Lista de Clientes -->
	<div class="max-w-7xl mx-auto px-4 py-6">
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="text-center">
					<div class="inline-block w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
					<p class="text-gray-600">Cargando ruta...</p>
				</div>
			</div>
		{:else if clientesFiltrados.length === 0}
			<div class="text-center py-12">
				<div class="text-6xl mb-4">📭</div>
				<p class="text-xl text-gray-600 mb-2">
					{searchQuery ? 'No se encontraron clientes' : 'No hay clientes en tu ruta'}
				</p>
				<p class="text-gray-500">
					{searchQuery ? 'Intenta con otro término de búsqueda' : 'Los clientes con créditos activos aparecerán aquí'}
				</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each clientesFiltrados as cliente (cliente.id)}
					<ClienteCardCompacta
						{cliente}
						onCobrar={handleCobrar}
						onVerDetalles={handleVerDetalles}
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Modal de Cobro Inteligente -->
{#if clienteSeleccionado}
	<ModalCobroInteligente
		bind:open={modalCobroOpen}
		cliente={clienteSeleccionado}
		onSuccess={handleCobroExitoso}
	/>
{/if}
