<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { db } from '$lib/db/local.js';
	import { syncCounter } from '$lib/stores/sync.js';
	import { syncAll } from '$lib/sync/index.js';
	import ErrorCard from '$lib/components/ErrorCard.svelte';
	import ErrorDetailModal from '$lib/components/ErrorDetailModal.svelte';
	import {
		getNombreRegistro,
		getMensajeErrorLegible,
		getTipoError,
		obtenerRegistro
	} from '$lib/utils/errores.js';

	let errores = $state([]);
	let loading = $state(true);
	let selectedError = $state(null);
	let showModal = $state(false);
	let processing = $state(false);

	onMount(async () => {
		await cargarErrores();

		// Recargar cuando cambia syncCounter
		const unsubscribe = syncCounter.subscribe(() => {
			cargarErrores();
		});

		return () => unsubscribe();
	});

	async function cargarErrores() {
		loading = true;

		try {
			// Obtener operaciones fallidas
			const operacionesFallidas = await db.sync_queue
				.filter((item) => !item.synced && item.retry_count >= 5)
				.toArray();

			// Enriquecer con datos del registro
			errores = await Promise.all(
				operacionesFallidas.map(async (op) => {
					const registro = await obtenerRegistro(op.table, op.data.id);
					return {
						...op,
						nombreRegistro: getNombreRegistro(op.table, op.data, registro),
						mensajeError: getMensajeErrorLegible(op.last_error),
						tipoError: getTipoError(op.last_error)
					};
				})
			);
		} catch (err) {
			console.error('Error cargando errores:', err);
			errores = [];
		} finally {
			loading = false;
		}
	}

	function verDetalles(error) {
		selectedError = error;
		showModal = true;
	}

	async function reintentarTodo() {
		if (processing) return;
		if (!confirm('¿Reintentar todas las operaciones fallidas?')) return;

		try {
			processing = true;

			for (const error of errores) {
				await db.sync_queue.update(error.id, {
					retry_count: 0,
					next_retry: new Date().toISOString()
				});
			}

			// Sincronizar inmediatamente
			await syncAll();
			await cargarErrores();
		} catch (err) {
			console.error('Error al reintentar todo:', err);
			alert('Error al reintentar las operaciones');
		} finally {
			processing = false;
		}
	}

	async function limpiarTodo() {
		if (processing) return;
		if (!confirm('¿Eliminar TODAS las operaciones fallidas? No se podrán recuperar')) return;

		try {
			processing = true;

			for (const error of errores) {
				await db.sync_queue.delete(error.id);
				await db.error_log.add({
					type: 'manually_deleted',
					table: error.table,
					operation: error.operation,
					error_message: 'Eliminado manualmente por el usuario',
					timestamp: new Date().toISOString(),
					user_id: 'local'
				});
			}

			await cargarErrores();
		} catch (err) {
			console.error('Error al limpiar todo:', err);
			alert('Error al eliminar las operaciones');
		} finally {
			processing = false;
		}
	}

	function volver() {
		goto('/configuracion');
	}
</script>

<div class="errores-page">
	<div class="header">
		<button onclick={volver} class="btn-back">← Volver</button>
		<h1>Errores de Sincronización</h1>
	</div>

	{#if loading}
		<p class="loading">Cargando errores...</p>
	{:else if errores.length === 0}
		<div class="empty-state">
			<div class="success-icon">✅</div>
			<h2>No hay errores de sincronización</h2>
			<p>Todas las operaciones se sincronizaron correctamente</p>
		</div>
	{:else}
		<div class="actions-header">
			<div class="summary">
				<span class="count">{errores.length}</span>
				<span class="text">operación{errores.length > 1 ? 'es' : ''} fallida{errores.length > 1 ? 's' : ''}</span>
			</div>
			<div class="actions">
				<button onclick={reintentarTodo} disabled={processing} class="btn-secondary">
					🔄 Reintentar Todo
				</button>
				<button onclick={limpiarTodo} disabled={processing} class="btn-danger">
					🗑️ Limpiar Todo
				</button>
			</div>
		</div>

		<div class="errores-list">
			{#each errores as error (error.id)}
				<ErrorCard {error} onVerDetalles={() => verDetalles(error)} />
			{/each}
		</div>
	{/if}
</div>

{#if showModal && selectedError}
	<ErrorDetailModal
		error={selectedError}
		onClose={() => (showModal = false)}
		onResolved={() => {
			showModal = false;
			cargarErrores();
		}}
	/>
{/if}

<style>
	.errores-page {
		min-height: 100%;
		background: #f8fafc;
		padding-bottom: 2rem;
	}

	.header {
		position: sticky;
		top: 0;
		z-index: 10;
		padding: 1rem;
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
		margin-bottom: 0.75rem;
	}

	.btn-back:hover {
		background: #f8fafc;
		border-color: #4f46e5;
	}

	.header h1 {
		margin: 0;
		font-size: 1.5rem;
		color: #1e293b;
	}

	.loading {
		text-align: center;
		padding: 3rem;
		color: #999;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
	}

	.success-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.empty-state h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		color: #1e293b;
	}

	.empty-state p {
		margin: 0;
		color: #64748b;
	}

	.actions-header {
		padding: 1rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.summary {
		margin-bottom: 1rem;
		font-size: 1rem;
	}

	.count {
		font-size: 2rem;
		font-weight: 700;
		color: #dc2626;
		margin-right: 0.5rem;
	}

	.text {
		color: #64748b;
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.btn-secondary {
		padding: 0.75rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		color: #4f46e5;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #f8fafc;
		border-color: #4f46e5;
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-danger {
		padding: 0.75rem;
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

	.errores-list {
		padding: 1rem;
	}
</style>
