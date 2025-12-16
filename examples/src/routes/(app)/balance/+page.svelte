<script>
	import { onMount } from 'svelte';
	
	let loading = $state(true);
	let balance = $state({
		hoy: 0,
		semana: 0,
		mes: 0
	});
	
	onMount(async () => {
		// TODO: Cargar datos de balance
		loading = false;
	});
</script>

<div class="balance-page">
	<div class="page-content">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Cargando balance...</p>
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">💰</div>
				<h2>Balance</h2>
				<p>Aquí verás el resumen de cobros y pagos</p>
				<p class="text-sm">Próximamente disponible</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.balance-page {
		min-height: 100%;
		background: #f8fafc;
	}
	
	.page-content {
		padding: 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}
	
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		color: #6b7280;
	}
	
	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #e5e7eb;
		border-top-color: #2563eb;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 1rem;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	.empty-state {
		text-align: center;
		padding: 4rem 1rem;
	}
	
	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}
	
	.empty-state h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: #111827;
		margin-bottom: 0.5rem;
	}
	
	.empty-state p {
		color: #6b7280;
		margin-bottom: 0.5rem;
	}
	
	.text-sm {
		font-size: 0.875rem;
	}
</style>
