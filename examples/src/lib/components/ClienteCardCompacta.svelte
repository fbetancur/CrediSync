<script>
	import { formatearMoneda } from '$lib/utils/creditos.js';
	
	let { cliente, onCobrar, onVerDetalles } = $props();
	
	// Determinar color del badge según estado
	const estadoConfig = {
		'AL_DIA': { color: 'bg-green-100 text-green-800', icon: '🟢', label: 'AL DÍA' },
		'PROXIMO': { color: 'bg-yellow-100 text-yellow-800', icon: '🟡', label: 'PRÓXIMO' },
		'MORA': { color: 'bg-red-100 text-red-800', icon: '🔴', label: 'MORA' },
		'SIN_CREDITO': { color: 'bg-gray-100 text-gray-800', icon: '⚪', label: 'SIN CRÉDITO' }
	};
	
	const config = estadoConfig[cliente.estado] || estadoConfig['SIN_CREDITO'];
	
	// Formatear resumen de créditos
	const resumenCreditos = $derived(() => {
		if (!cliente.creditos || cliente.creditos.length === 0) {
			return 'Sin créditos activos';
		}
		
		const partes = [];
		
		// Calcular total de cuotas a cobrar (atrasadas + hoy)
		const totalCuotasACobrar = cliente.creditos.reduce((sum, c) => sum + (c.cuotas_a_cobrar || 0), 0);
		
		if (totalCuotasACobrar > 0) {
			if (cliente.resumen.cuotas_atrasadas > 0) {
				partes.push(`${totalCuotasACobrar} cuota${totalCuotasACobrar !== 1 ? 's' : ''} (${cliente.resumen.cuotas_atrasadas} atrasada${cliente.resumen.cuotas_atrasadas !== 1 ? 's' : ''})`);
			} else {
				partes.push(`${totalCuotasACobrar} cuota${totalCuotasACobrar !== 1 ? 's' : ''} hoy`);
			}
		}
		
		if (cliente.creditos.length > 0) {
			partes.push(`${cliente.creditos.length} crédito${cliente.creditos.length !== 1 ? 's' : ''}`);
		}
		
		return partes.join(' • ');
	});
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
	<!-- Header: Nombre y Estado -->
	<div class="flex items-start justify-between mb-3">
		<div class="flex-1 min-w-0">
			<h3 class="text-lg font-semibold text-gray-900 truncate">
				👤 {cliente.nombre}
			</h3>
			{#if cliente.telefono}
				<p class="text-sm text-gray-600 mt-1">
					📞 {cliente.telefono}
				</p>
			{/if}
		</div>
		
		<span class="ml-3 px-3 py-1 rounded-full text-xs font-medium {config.color} whitespace-nowrap">
			{config.icon} {config.label}
		</span>
	</div>
	
	<!-- Monto Adeudado -->
	<div class="mb-3">
		<div class="flex items-baseline gap-2">
			<span class="text-2xl font-bold text-gray-900">
				{formatearMoneda(cliente.resumen.total_adeudado)}
			</span>
			{#if cliente.resumen.dias_atraso_max > 0}
				<span class="text-sm text-red-600 font-medium">
					• {cliente.resumen.dias_atraso_max} día{cliente.resumen.dias_atraso_max !== 1 ? 's' : ''} atraso
				</span>
			{/if}
		</div>
		<p class="text-sm text-gray-600 mt-1">
			{resumenCreditos()}
		</p>
	</div>
	
	<!-- Botones de Acción -->
	<div class="flex gap-2">
		{#if cliente.resumen.total_adeudado > 0}
			<button
				onclick={() => onCobrar(cliente)}
				class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
			>
				💵 Cobrar
			</button>
		{/if}
		
		<button
			onclick={() => onVerDetalles(cliente)}
			class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
		>
			👁️ Ver
		</button>
	</div>
</div>
