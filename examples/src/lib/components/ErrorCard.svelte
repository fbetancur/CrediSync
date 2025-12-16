<script>
	import { getOperacionTexto, getTablaTexto } from '$lib/utils/errores.js';

	let { error, onVerDetalles } = $props();

	function getTiempoTranscurrido(timestamp) {
		const diff = Date.now() - new Date(timestamp).getTime();
		const minutos = Math.floor(diff / 60000);
		const horas = Math.floor(minutos / 60);
		const dias = Math.floor(horas / 24);

		if (dias > 0) return `Hace ${dias} día${dias > 1 ? 's' : ''}`;
		if (horas > 0) return `Hace ${horas} hora${horas > 1 ? 's' : ''}`;
		if (minutos > 0) return `Hace ${minutos} minuto${minutos > 1 ? 's' : ''}`;
		return 'Hace un momento';
	}
</script>

<div class="error-card" onclick={onVerDetalles}>
	<div class="error-header">
		<div class="error-icon {error.tipoError}">
			{#if error.tipoError === 'network'}
				📡
			{:else if error.tipoError === 'server'}
				🔴
			{:else if error.tipoError === 'validation'}
				⚠️
			{:else}
				❌
			{/if}
		</div>

		<div class="error-info">
			<div class="error-title">
				{getOperacionTexto(error.operation)}
				{getTablaTexto(error.table)}
			</div>
			<div class="error-subtitle">
				{error.nombreRegistro}
			</div>
		</div>

		<div class="error-badge">
			{error.retry_count}/5
		</div>
	</div>

	<div class="error-body">
		<div class="error-message">
			{error.mensajeError}
		</div>
		<div class="error-time">
			{getTiempoTranscurrido(error.timestamp)}
		</div>
	</div>

	<div class="error-footer">
		<span class="link">Ver detalles →</span>
	</div>
</div>

<style>
	.error-card {
		background: white;
		border: 1px solid #fee;
		border-left: 4px solid #dc2626;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.error-card:hover {
		box-shadow: 0 4px 12px rgba(220, 38, 38, 0.15);
		transform: translateY(-1px);
	}

	.error-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.error-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		border-radius: 8px;
		background: #fee;
	}

	.error-icon.network {
		background: #fef3c7;
	}

	.error-info {
		flex: 1;
	}

	.error-title {
		font-weight: 600;
		color: #dc2626;
		margin-bottom: 0.25rem;
	}

	.error-subtitle {
		font-size: 0.875rem;
		color: #666;
	}

	.error-badge {
		background: #dc2626;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.error-body {
		margin-bottom: 0.75rem;
	}

	.error-message {
		color: #666;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.error-time {
		color: #999;
		font-size: 0.75rem;
	}

	.error-footer {
		display: flex;
		justify-content: flex-end;
	}

	.link {
		color: #2563eb;
		font-size: 0.875rem;
		font-weight: 500;
	}
</style>
