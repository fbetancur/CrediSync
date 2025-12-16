<script>
	import { formatearMoneda } from '$lib/utils/creditos.js';
	import { registrarPagoMultiCredito } from '$lib/utils/cobros.js';
	import { showNotification } from '$lib/stores/notifications.js';
	
	let { open = $bindable(false), cliente, onSuccess } = $props();
	
	let montoPago = $state(cliente?.resumen?.total_adeudado || 0);
	let creditosSeleccionados = $state(new Set());
	let procesando = $state(false);
	
	// Inicializar créditos seleccionados (todos por defecto)
	$effect(() => {
		if (open && cliente?.creditos) {
			creditosSeleccionados = new Set(cliente.creditos.map(c => c.id));
			montoPago = cliente.resumen.total_adeudado;
		}
	});
	
	// Calcular distribución del pago
	const distribucion = $derived(() => {
		if (!cliente?.creditos || montoPago <= 0) return [];
		
		const creditosActivos = cliente.creditos.filter(c => 
			creditosSeleccionados.has(c.id) && c.adeudado > 0
		);
		
		if (creditosActivos.length === 0) return [];
		
		// Calcular total adeudado de créditos seleccionados
		const totalAdeudado = creditosActivos.reduce((sum, c) => sum + c.adeudado, 0);
		
		let montoRestante = montoPago;
		const dist = [];
		
		// Distribuir proporcionalmente
		for (let i = 0; i < creditosActivos.length; i++) {
			const credito = creditosActivos[i];
			const esUltimo = i === creditosActivos.length - 1;
			
			let montoParaCredito;
			if (esUltimo) {
				// Último crédito recibe lo que queda (evita errores de redondeo)
				montoParaCredito = montoRestante;
			} else {
				// Distribución proporcional
				const proporcion = credito.adeudado / totalAdeudado;
				montoParaCredito = Math.min(
					Math.round(montoPago * proporcion * 100) / 100,
					credito.adeudado
				);
			}
			
			montoRestante -= montoParaCredito;
			
			dist.push({
				credito_id: credito.id,
				credito_numero: credito.numero,
				credito_tipo: credito.tipo,
				adeudado: credito.adeudado,
				cuotas_atrasadas: credito.cuotas_atrasadas,
				dias_atraso: credito.dias_atraso,
				monto_aplicar: montoParaCredito
			});
		}
		
		return dist;
	});
	
	// Validar si el pago es completo
	const espagoCompleto = $derived(() => {
		const totalDistribuido = distribucion().reduce((sum, d) => sum + d.monto_aplicar, 0);
		const totalAdeudado = distribucion().reduce((sum, d) => sum + d.adeudado, 0);
		return Math.abs(totalDistribuido - totalAdeudado) < 0.01;
	});
	
	// Toggle selección de crédito
	function toggleCredito(creditoId) {
		if (creditosSeleccionados.has(creditoId)) {
			creditosSeleccionados.delete(creditoId);
		} else {
			creditosSeleccionados.add(creditoId);
		}
		creditosSeleccionados = new Set(creditosSeleccionados);
	}
	
	// Manejar cambio de monto
	function handleMontoChange(e) {
		const valor = parseFloat(e.target.value) || 0;
		montoPago = Math.max(0, valor);
	}
	
	// Confirmar cobro
	async function confirmarCobro() {
		if (procesando) return;
		
		if (montoPago <= 0) {
			showNotification({
				type: 'error',
				message: 'El monto debe ser mayor a cero',
				duration: 3000
			});
			return;
		}
		
		if (distribucion().length === 0) {
			showNotification({
				type: 'error',
				message: 'Debe seleccionar al menos un crédito',
				duration: 3000
			});
			return;
		}
		
		try {
			procesando = true;
			
			await registrarPagoMultiCredito({
				cliente_id: cliente.id,
				monto_total: montoPago,
				distribucion: distribucion()
			});
			
			showNotification({
				type: 'success',
				message: `Pago de ${formatearMoneda(montoPago)} registrado exitosamente`,
				duration: 3000
			});
			
			open = false;
			if (onSuccess) onSuccess();
			
		} catch (error) {
			console.error('Error al registrar pago:', error);
			showNotification({
				type: 'error',
				message: 'Error al registrar el pago',
				duration: 3000
			});
		} finally {
			procesando = false;
		}
	}
	
	function cerrar() {
		if (!procesando) {
			open = false;
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick={cerrar}>
		<div class="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden" onclick={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
				<h2 class="text-xl font-bold flex items-center gap-2">
					💵 Cobrar a {cliente.nombre}
				</h2>
				<button
					onclick={cerrar}
					disabled={procesando}
					class="text-white hover:text-gray-200 text-2xl leading-none disabled:opacity-50"
				>
					×
				</button>
			</div>
			
			<!-- Body -->
			<div class="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
				<!-- Monto a Cobrar -->
				<div class="mb-6">
					<label class="block text-sm font-medium text-gray-700 mb-2">
						Monto recibido:
					</label>
					<div class="relative">
						<span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
						<input
							type="number"
							value={montoPago}
							oninput={handleMontoChange}
							step="0.01"
							min="0"
							disabled={procesando}
							class="w-full pl-8 pr-4 py-3 text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
							placeholder="0.00"
						/>
					</div>
					<p class="text-sm text-gray-600 mt-1">
						Total adeudado: {formatearMoneda(cliente.resumen.total_adeudado)}
					</p>
				</div>
				
				<!-- Lista de Créditos -->
				<div class="mb-6">
					<label class="block text-sm font-medium text-gray-700 mb-3">
						Aplicar a:
					</label>
					
					<div class="space-y-3">
						{#each distribucion() as dist}
							<div class="border-2 {creditosSeleccionados.has(dist.credito_id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} rounded-lg p-4 transition-colors">
								<label class="flex items-start gap-3 cursor-pointer">
									<input
										type="checkbox"
										checked={creditosSeleccionados.has(dist.credito_id)}
										onchange={() => toggleCredito(dist.credito_id)}
										disabled={procesando}
										class="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
									/>
									
									<div class="flex-1 min-w-0">
										<div class="flex items-center justify-between mb-2">
											<span class="font-semibold text-gray-900">
												📋 Crédito {dist.credito_tipo} #{dist.credito_numero}
											</span>
										</div>
										
										<div class="text-sm text-gray-600 space-y-1">
											<div class="flex justify-between">
												<span>💰 A cobrar hoy:</span>
												<span class="font-medium">{formatearMoneda(dist.adeudado)}</span>
											</div>
											{#if dist.cuotas_atrasadas > 0}
												<div class="flex justify-between text-red-600">
													<span>⚠️ Cuotas atrasadas:</span>
													<span class="font-medium">{dist.cuotas_atrasadas}</span>
												</div>
												<div class="flex justify-between text-red-600">
													<span>⏰ Días atraso:</span>
													<span class="font-medium">{dist.dias_atraso} días</span>
												</div>
											{:else}
												<div class="flex justify-between text-green-600">
													<span>✓ Al día (cuota de hoy)</span>
												</div>
											{/if}
										</div>
										
										{#if creditosSeleccionados.has(dist.credito_id)}
											<div class="mt-3 pt-3 border-t border-blue-200">
												<div class="flex justify-between items-center">
													<span class="text-sm font-medium text-blue-900">→ Aplicar:</span>
													<span class="text-lg font-bold text-blue-600">
														{formatearMoneda(dist.monto_aplicar)}
													</span>
												</div>
											</div>
										{/if}
									</div>
								</label>
							</div>
						{/each}
					</div>
				</div>
				
				<!-- Resumen -->
				{#if distribucion().length > 0}
					<div class="bg-green-50 border-2 border-green-200 rounded-lg p-4">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-2xl">✅</span>
							<span class="font-semibold text-green-900">
								{espagoCompleto() ? 'Pago completo' : 'Pago parcial'}
							</span>
						</div>
						<p class="text-sm text-green-800">
							{#if espagoCompleto()}
								Se liquidarán {cliente.resumen.cuotas_atrasadas} cuota{cliente.resumen.cuotas_atrasadas !== 1 ? 's' : ''} atrasada{cliente.resumen.cuotas_atrasadas !== 1 ? 's' : ''}
							{:else}
								Se aplicará {formatearMoneda(montoPago)} a {distribucion().length} crédito{distribucion().length !== 1 ? 's' : ''}
							{/if}
						</p>
					</div>
				{/if}
			</div>
			
			<!-- Footer -->
			<div class="bg-gray-50 px-6 py-4 flex gap-3">
				<button
					onclick={cerrar}
					disabled={procesando}
					class="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
				>
					Cancelar
				</button>
				<button
					onclick={confirmarCobro}
					disabled={procesando || distribucion().length === 0 || montoPago <= 0}
					class="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					{#if procesando}
						<span class="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
						Procesando...
					{:else}
						✓ Confirmar Cobro
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
