<script>
	import { page } from '$app/stores';
	import { auth } from '$lib/stores/simple-auth.js';
	import { goto } from '$app/navigation';

	// Función para limpiar y reiniciar
	function handleReset() {
		auth.clearCorruptedState();
	}

	// Función para ir al login
	function goToLogin() {
		goto('/login');
	}
</script>

<div class="error-container">
	<div class="error-card">
		<div class="error-icon">⚠️</div>
		<h1>Oops! Algo salió mal</h1>
		
		<div class="error-details">
			<p>Se ha producido un error inesperado en la aplicación.</p>
			{#if $page.error?.message}
				<details>
					<summary>Detalles técnicos</summary>
					<code>{$page.error.message}</code>
				</details>
			{/if}
		</div>

		<div class="error-actions">
			<button class="btn-primary" on:click={handleReset}>
				🔄 Reiniciar Aplicación
			</button>
			<button class="btn-secondary" on:click={goToLogin}>
				🔑 Ir al Login
			</button>
		</div>

		<div class="error-help">
			<p>Si el problema persiste:</p>
			<ul>
				<li>Intenta hacer un "hard refresh" (Ctrl+F5)</li>
				<li>Limpia el cache del navegador</li>
				<li>Verifica tu conexión a internet</li>
			</ul>
		</div>
	</div>
</div>

<style>
	.error-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 20px;
	}

	.error-card {
		background: white;
		border-radius: 12px;
		padding: 40px;
		max-width: 500px;
		width: 100%;
		text-align: center;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
	}

	.error-icon {
		font-size: 4rem;
		margin-bottom: 20px;
	}

	h1 {
		color: #1f2937;
		margin-bottom: 20px;
		font-size: 1.8rem;
	}

	.error-details {
		margin-bottom: 30px;
		text-align: left;
	}

	.error-details p {
		color: #6b7280;
		margin-bottom: 15px;
	}

	details {
		margin-top: 15px;
		padding: 10px;
		background: #f9fafb;
		border-radius: 6px;
	}

	summary {
		cursor: pointer;
		font-weight: 600;
		color: #374151;
	}

	code {
		display: block;
		margin-top: 10px;
		padding: 10px;
		background: #1f2937;
		color: #f9fafb;
		border-radius: 4px;
		font-size: 0.875rem;
		word-break: break-all;
	}

	.error-actions {
		display: flex;
		gap: 15px;
		justify-content: center;
		margin-bottom: 30px;
		flex-wrap: wrap;
	}

	.btn-primary, .btn-secondary {
		padding: 12px 24px;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
		font-size: 0.95rem;
	}

	.btn-primary {
		background: #3b82f6;
		color: white;
	}

	.btn-primary:hover {
		background: #2563eb;
		transform: translateY(-1px);
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
		border: 1px solid #d1d5db;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
		transform: translateY(-1px);
	}

	.error-help {
		text-align: left;
		background: #f9fafb;
		padding: 20px;
		border-radius: 8px;
		border-left: 4px solid #3b82f6;
	}

	.error-help p {
		margin: 0 0 10px 0;
		font-weight: 600;
		color: #374151;
	}

	.error-help ul {
		margin: 0;
		padding-left: 20px;
	}

	.error-help li {
		color: #6b7280;
		margin-bottom: 5px;
	}

	@media (max-width: 640px) {
		.error-card {
			padding: 30px 20px;
		}

		.error-actions {
			flex-direction: column;
		}

		.btn-primary, .btn-secondary {
			width: 100%;
		}
	}
</style>