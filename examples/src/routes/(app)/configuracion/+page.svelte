<script>
	import { onMount } from 'svelte';
	import { auth, user } from '$lib/stores/auth.js';
	import { isOnline, isSyncing, lastSync, syncCounter } from '$lib/stores/sync.js';
	import { syncAll } from '$lib/sync/index.js';
	import { db } from '$lib/db/local.js';
	import { goto } from '$app/navigation';
	
	let syncing = $state(false);
	let erroresCount = $state(0);
	
	onMount(async () => {
		await actualizarContador();
		
		const unsubscribe = syncCounter.subscribe(() => {
			actualizarContador();
		});
		
		return () => unsubscribe();
	});
	
	async function actualizarContador() {
		try {
			erroresCount = await db.sync_queue
				.filter((item) => !item.synced && item.retry_count >= 5)
				.count();
		} catch (err) {
			console.error('Error contando errores:', err);
			erroresCount = 0;
		}
	}
	
	async function handleSync() {
		if (syncing || $isSyncing) return;
		
		console.log('🔄 [CONFIG] Sincronización forzada iniciada por usuario');
		syncing = true;
		
		try {
			// Sincronizar TODAS las tablas (forzado = true)
			await syncAll(true);
			console.log('✅ [CONFIG] Sincronización forzada completada');
		} catch (error) {
			console.error('❌ [CONFIG] Error en sincronización forzada:', error);
		} finally {
			syncing = false;
		}
	}
	
	async function handleSignOut() {
		await auth.signOut();
		goto('/login');
	}
	
	async function limpiarDatosPrueba() {
		if (!confirm('¿Estás seguro? Esto eliminará TODOS los créditos, cuotas y pagos locales. Los clientes NO se eliminarán.')) {
			return;
		}
		
		try {
			syncing = true;
			
			// Limpiar tablas locales
			await db.creditos.clear();
			await db.cuotas.clear();
			await db.pagos.clear();
			await db.sync_queue.where('table').anyOf(['creditos', 'cuotas', 'pagos']).delete();
			
			console.log('✅ Datos de prueba eliminados de IndexedDB');
			alert('Datos locales limpiados. Ahora debes eliminar los datos de Supabase manualmente si es necesario.');
			
		} catch (err) {
			console.error('Error limpiando datos:', err);
			alert('Error al limpiar datos: ' + err.message);
		} finally {
			syncing = false;
		}
	}
</script>

<div class="config-page">
	<div class="page-content">
		<!-- Información del usuario -->
		<section class="config-section">
			<h2 class="section-title">Cuenta</h2>
			<div class="config-card">
				<div class="user-info">
					<div class="user-avatar">
						<span>{$user?.email?.charAt(0).toUpperCase() || 'U'}</span>
					</div>
					<div class="user-details">
						<p class="user-email">{$user?.email || 'Usuario'}</p>
						<p class="user-role">Cobrador</p>
					</div>
				</div>
			</div>
		</section>
		
		<!-- Sincronización -->
		<section class="config-section">
			<h2 class="section-title">Sincronización</h2>
			<div class="config-card">
				<div class="sync-status">
					<div class="status-row">
						<span class="status-label">Estado de conexión</span>
						<span class="status-value {$isOnline ? 'online' : 'offline'}">
							{$isOnline ? '🟢 Online' : '🔴 Offline'}
						</span>
					</div>
					<div class="status-row">
						<span class="status-label">Estado de sincronización</span>
						<span class="status-value">
							{$isSyncing ? '🟡 Sincronizando...' : '🟢 Sincronizado'}
						</span>
					</div>
					{#if $lastSync}
						<div class="status-row">
							<span class="status-label">Última sincronización</span>
							<span class="status-value">
								{new Date($lastSync).toLocaleString()}
							</span>
						</div>
					{/if}
				</div>
				
				<button 
					onclick={handleSync}
					disabled={syncing || $isSyncing || !$isOnline}
					class="sync-btn"
				>
					{#if syncing || $isSyncing}
						<div class="btn-spinner"></div>
						Sincronizando...
					{:else}
						🔄 Sincronizar ahora
					{/if}
				</button>
			</div>
		</section>
		
		<!-- Opciones -->
		<section class="config-section">
			<h2 class="section-title">Opciones</h2>
			<div class="config-card">
				<button
					class="option-btn {erroresCount > 0 ? 'has-errors' : ''}"
					onclick={() => goto('/configuracion/errores-sincronizacion')}
				>
					<div class="option-content">
						<span class="option-icon">{erroresCount > 0 ? '⚠️' : '✅'}</span>
						<div class="option-text">
							<span class="option-title">Errores de Sincronización</span>
							<span class="option-subtitle">
								{#if erroresCount > 0}
									{erroresCount} operación{erroresCount > 1 ? 'es' : ''} fallida{erroresCount > 1 ? 's' : ''}
								{:else}
									Todo sincronizado correctamente
								{/if}
							</span>
						</div>
					</div>
					{#if erroresCount > 0}
						<span class="error-badge">{erroresCount}</span>
					{/if}
					<svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
				<button class="option-btn" onclick={() => goto('/configuracion/productos')}>
					<span>💳 Productos de Crédito</span>
					<svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
				<button class="option-btn">
					<span>📋 Ordenar mi ruta</span>
					<svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
				<button class="option-btn">
					<span>📊 Reportes</span>
					<svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
				<button class="option-btn">
					<span>ℹ️ Ayuda</span>
					<svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>
		</section>
		
		<!-- Desarrollo -->
		<section class="config-section">
			<h2 class="section-title">Desarrollo</h2>
			<div class="config-card">
				<button onclick={limpiarDatosPrueba} class="danger-btn" disabled={syncing}>
					🗑️ Limpiar datos de prueba
				</button>
				<p class="warning-text">
					⚠️ Esto eliminará todos los créditos, cuotas y pagos locales. Los clientes NO se eliminarán.
				</p>
			</div>
		</section>
		
		<!-- Cerrar sesión -->
		<section class="config-section">
			<button onclick={handleSignOut} class="signout-btn">
				Cerrar sesión
			</button>
		</section>
	</div>
</div>

<style>
	.config-page {
		min-height: 100%;
		background: #f8fafc;
	}
	
	.page-content {
		padding: 1rem;
		max-width: 600px;
		margin: 0 auto;
	}
	
	.config-section {
		margin-bottom: 1.5rem;
	}
	
	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
		padding: 0 0.25rem;
	}
	
	.config-card {
		background: white;
		border-radius: 12px;
		padding: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	
	/* Usuario */
	.user-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	
	.user-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, #2563eb, #4f46e5);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 1.5rem;
		font-weight: 600;
		flex-shrink: 0;
	}
	
	.user-details {
		flex: 1;
		min-width: 0;
	}
	
	.user-email {
		font-weight: 600;
		color: #111827;
		margin-bottom: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.user-role {
		font-size: 0.875rem;
		color: #6b7280;
	}
	
	/* Sincronización */
	.sync-status {
		margin-bottom: 1rem;
	}
	
	.status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 0;
		border-bottom: 1px solid #f3f4f6;
	}
	
	.status-row:last-child {
		border-bottom: none;
	}
	
	.status-label {
		font-size: 0.875rem;
		color: #6b7280;
	}
	
	.status-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: #111827;
	}
	
	.status-value.online {
		color: #10b981;
	}
	
	.status-value.offline {
		color: #ef4444;
	}
	
	.sync-btn {
		width: 100%;
		padding: 0.75rem;
		background: #2563eb;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	
	.sync-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}
	
	.sync-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid white;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	/* Opciones */
	.option-btn {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid #f3f4f6;
		color: #111827;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}
	
	.option-btn:last-child {
		border-bottom: none;
	}
	
	.option-btn:hover {
		background: #f9fafb;
	}
	
	.option-btn:active {
		background: #f3f4f6;
	}
	
	.chevron {
		width: 20px;
		height: 20px;
		color: #9ca3af;
		flex-shrink: 0;
	}

	.option-btn.has-errors {
		background: #fef2f2;
		border-bottom-color: #fecaca;
	}

	.option-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.option-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.option-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}

	.option-title {
		font-weight: 600;
		color: #111827;
	}

	.option-subtitle {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.option-btn.has-errors .option-subtitle {
		color: #dc2626;
		font-weight: 500;
	}

	.error-badge {
		background: #dc2626;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 700;
		margin-left: auto;
	}
	
	/* Cerrar sesión */
	.signout-btn {
		width: 100%;
		padding: 1rem;
		background: white;
		color: #ef4444;
		border: 1px solid #fecaca;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	
	.signout-btn:hover {
		background: #fef2f2;
		border-color: #fca5a5;
	}
	
	.signout-btn:active {
		transform: scale(0.98);
	}
	
	.danger-btn {
		width: 100%;
		padding: 1rem;
		background: #fef2f2;
		border: 2px solid #ef4444;
		border-radius: 12px;
		color: #ef4444;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 0.75rem;
	}
	
	.danger-btn:hover:not(:disabled) {
		background: #fee2e2;
	}
	
	.danger-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.warning-text {
		font-size: 0.875rem;
		color: #64748b;
		margin: 0;
		padding: 0.5rem;
		background: #fff7ed;
		border-radius: 8px;
		border-left: 3px solid #f59e0b;
	}
</style>
