<script>
	import { db } from '$lib/db/local.js';
	import { syncAll } from '$lib/sync/index.js';

	let { error, onClose, onResolved } = $props();

	let processing = $state(false);

	async function reintentar() {
		if (processing) return;

		try {
			processing = true;

			// Resetear contador
			await db.sync_queue.update(error.id, {
				retry_count: 0,
				next_retry: new Date().toISOString()
			});

			// Sincronizar inmediatamente
			await syncAll();

			// Verificar si se resolvió
			const item = await db.sync_queue.get(error.id);
			if (item && item.synced) {
				onResolved();
			} else if (item && item.retry_count >= 5) {
				alert('La operación sigue fallando. Verifica el error y reintenta más tarde.');
			}
		} catch (err) {
			console.error('Error al reintentar:', err);
			alert('Error al reintentar la operación');
		} finally {
			processing = false;
		}
	}

	async function eliminar() {
		if (processing) return;
		if (!confirm('¿Eliminar esta operación? No se podrá recuperar')) return;

		try {
			processing = true;

			await db.sync_queue.delete(error.id);
			await db.error_log.add({
				type: 'manually_deleted',
				table: error.table,
				operation: error.operation,
				error_message: 'Eliminado manualmente por el usuario',
				timestamp: new Date().toISOString(),
				user_id: 'local'
			});

			onResolved();
		} catch (err) {
			console.error('Error al eliminar:', err);
			alert('Error al eliminar la operación');
		} finally {
			processing = false;
		}
	}
</script>

<div class="modal-overlay" onclick={onClose}>
	<div class="modal-content" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>Detalles del Error</h2>
			<button onclick={onClose} class="close-btn">✕</button>
		</div>

		<div class="modal-body">
			<!-- Tipo de Operación -->
			<div class="section">
				<h3>Operación</h3>
				<div class="info-row">
					<span class="label">Tipo:</span>
					<span class="value">{error.operation} en {error.table}</span>
				</div>
				<div class="info-row">
					<span class="label">Registro:</span>
					<span class="value">{error.nombreRegistro}</span>
				</div>
				<div class="info-row">
					<span class="label">Intentos:</span>
					<span class="value">{error.retry_count}/5</span>
				</div>
			</div>

			<!-- Error -->
			<div class="section">
				<h3>Error</h3>
				<div class="error-box">
					<div class="error-type {error.tipoError}">
						{#if error.tipoError === 'network'}
							📡 Sin conexión a internet
						{:else if error.tipoError === 'server'}
							🔴 Error del servidor
						{:else if error.tipoError === 'validation'}
							⚠️ Error de validación
						{:else}
							❌ Error desconocido
						{/if}
					</div>
					<div class="error-message">
						{error.last_error || 'Sin mensaje de error'}
					</div>
				</div>

				<!-- Sugerencia -->
				<div class="suggestion">
					{#if error.tipoError === 'network'}
						💡 Verifica tu conexión a internet y reintenta
					{:else if error.tipoError === 'server'}
						💡 Problema temporal del servidor, reintenta más tarde
					{:else if error.tipoError === 'validation'}
						💡 Revisa los datos y corrige antes de reintentar
					{:else}
						💡 Contacta al soporte si el problema persiste
					{/if}
				</div>
			</div>

			<!-- Datos -->
			<div class="section">
				<h3>Datos de la Operación</h3>
				<pre class="data-box">{JSON.stringify(error.data, null, 2)}</pre>
			</div>
		</div>

		<div class="modal-footer">
			<button onclick={eliminar} disabled={processing} class="btn-danger">
				🗑️ Eliminar de Cola
			</button>
			<button onclick={reintentar} disabled={processing} class="btn-primary">
				{processing ? '⏳ Procesando...' : '🔄 Reintentar Ahora'}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: white;
		border-radius: 12px;
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #666;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.modal-body {
		padding: 1.5rem;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #374151;
	}

	.info-row {
		display: flex;
		padding: 0.5rem 0;
		border-bottom: 1px solid #f3f4f6;
	}

	.label {
		font-weight: 600;
		color: #6b7280;
		width: 100px;
	}

	.value {
		flex: 1;
		color: #111827;
	}

	.error-box {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
	}

	.error-type {
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: #dc2626;
	}

	.error-type.network {
		color: #d97706;
	}

	.error-message {
		color: #666;
		font-size: 0.875rem;
		font-family: monospace;
		word-break: break-word;
	}

	.suggestion {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		padding: 0.75rem;
		color: #1e40af;
		font-size: 0.875rem;
	}

	.data-box {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 1rem;
		font-size: 0.75rem;
		overflow-x: auto;
		max-height: 200px;
		margin: 0;
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		padding: 1.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.btn-primary {
		flex: 1;
		padding: 0.75rem 1.5rem;
		background: #2563eb;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-danger {
		padding: 0.75rem 1.5rem;
		background: white;
		color: #dc2626;
		border: 1px solid #dc2626;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-danger:hover:not(:disabled) {
		background: #fef2f2;
	}

	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
