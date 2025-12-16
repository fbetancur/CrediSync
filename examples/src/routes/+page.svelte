<script>
	import { supabase } from '$lib/supabase.js';
	import { user, auth } from '$lib/stores/auth.js';
	import { isOnline, isSyncing, lastSync, syncCounter } from '$lib/stores/sync.js';
	import { getClientes, createCliente, deleteCliente, syncToSupabase } from '$lib/sync/clientes.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Recargar clientes automáticamente cuando cambia el contador de sync
	$: if ($syncCounter > 0) {
		cargarClientes();
	}

	let nombre = 'CrediSync360';
	let supabaseConectado = false;
	let clientes = [];
	let loading = false;

	// Formulario
	let formData = {
		nombre: '',
		telefono: '',
		direccion: '',
		cedula: ''
	};
	let saving = false;
	let refreshing = false;

	onMount(async () => {
		// Redirigir a login si no está autenticado, o a ruta si está autenticado
		if (!$user) {
			goto('/login');
			return;
		}
		
		// Redirigir a la app principal
		goto('/ruta');
		return;

		// Probar conexión a Supabase
		const { data, error } = await supabase.from('clientes').select('count');
		supabaseConectado = !error;

		// Cargar clientes
		await cargarClientes();

		// Sincronizar al iniciar
		if ($isOnline) {
			await syncToSupabase();
			await cargarClientes();
		}

		// Implementar pull-to-refresh
		setupPullToRefresh();
	});

	// Pull-to-refresh para móviles
	function setupPullToRefresh() {
		let startY = 0;
		let pulling = false;

		const container = document.querySelector('.main-container');
		if (!container) return;

		container.addEventListener('touchstart', (e) => {
			if (container.scrollTop === 0) {
				startY = e.touches[0].pageY;
				pulling = true;
			}
		});

		container.addEventListener('touchmove', (e) => {
			if (!pulling) return;
			const currentY = e.touches[0].pageY;
			const diff = currentY - startY;
			
			if (diff > 80 && container.scrollTop === 0) {
				handleRefresh();
				pulling = false;
			}
		});

		container.addEventListener('touchend', () => {
			pulling = false;
		});
	}

	async function handleRefresh() {
		if (refreshing || $isSyncing) return;
		
		refreshing = true;
		await syncToSupabase();
		await cargarClientes();
		refreshing = false;
	}

	async function cargarClientes() {
		loading = true;
		clientes = await getClientes();
		loading = false;
	}

	async function guardarCliente() {
		if (!formData.nombre.trim()) return;

		saving = true;

		// Guardar offline-first
		await createCliente({
			nombre: formData.nombre,
			telefono: formData.telefono,
			direccion: formData.direccion,
			cedula: formData.cedula
		});

		saving = false;

		// Resetear formulario
		formData = { nombre: '', telefono: '', direccion: '', cedula: '' };
		// Recargar clientes
		await cargarClientes();
	}

	async function eliminarCliente(id) {
		if (!confirm('¿Eliminar este cliente?')) return;

		// Eliminar offline-first
		await deleteCliente(id);
		await cargarClientes();
	}

	async function handleSignOut() {
		await auth.signOut();
		goto('/login');
	}
</script>

{#if $user}
	<div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 main-container overflow-y-auto">
		<!-- Header -->
		<header class="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
			<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex justify-between items-center h-16">
					<div class="flex items-center gap-3 min-w-0">
						<div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
							<span class="text-white font-bold text-xl">C</span>
						</div>
						<div class="min-w-0">
							<h1 class="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
								{nombre}
							</h1>
							<p class="text-xs text-gray-500 truncate">{$user.email}</p>
						</div>
					</div>

					<button
						on:click={handleSignOut}
						class="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
					>
						Salir
					</button>
				</div>
			</div>
		</header>

		<div class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
			<!-- Status Banner -->
			<div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 mb-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-4 flex-wrap">
						<div class="flex items-center gap-2">
							<div class="w-2 h-2 {$isOnline ? 'bg-green-500' : 'bg-red-500'} rounded-full {$isOnline ? 'animate-pulse' : ''}"></div>
							<span class="text-sm font-medium text-gray-700">{$isOnline ? 'Online' : 'Offline'}</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-2 h-2 {$isSyncing ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'} rounded-full"></div>
							<span class="text-sm text-gray-600">{$isSyncing ? 'Sincronizando...' : 'Sincronizado'}</span>
						</div>
						{#if $lastSync}
							<span class="text-xs text-gray-500">
								{new Date($lastSync).toLocaleTimeString()}
							</span>
						{/if}
					</div>
					
					<!-- Botón de sincronización manual -->
					<button
						on:click={handleRefresh}
						disabled={refreshing || $isSyncing || !$isOnline}
						class="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
						title="Sincronizar ahora"
					>
						<svg 
							class="w-4 h-4 {refreshing || $isSyncing ? 'animate-spin' : ''}" 
							fill="none" 
							stroke="currentColor" 
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						<span class="hidden sm:inline">Sincronizar</span>
					</button>
				</div>
			</div>

			<!-- Formulario -->
			<div class="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-8">
				<div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
					<h2 class="text-xl font-bold text-white">Nuevo Cliente</h2>
					<p class="text-blue-100 text-sm mt-1">Agrega la información del cliente</p>
				</div>

				<form on:submit|preventDefault={guardarCliente} class="p-6 space-y-6">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div class="md:col-span-2">
							<label for="nombre" class="block text-sm font-semibold text-gray-700 mb-2">
								Nombre completo <span class="text-red-500">*</span>
							</label>
							<input
								id="nombre"
								type="text"
								bind:value={formData.nombre}
								required
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Ej: Juan Pérez García"
							/>
						</div>

						<div>
							<label for="cedula" class="block text-sm font-semibold text-gray-700 mb-2">
								Cédula/DNI
							</label>
							<input
								id="cedula"
								type="text"
								bind:value={formData.cedula}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="123456789"
							/>
						</div>

						<div>
							<label for="telefono" class="block text-sm font-semibold text-gray-700 mb-2">
								Teléfono
							</label>
							<input
								id="telefono"
								type="tel"
								bind:value={formData.telefono}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="300 123 4567"
							/>
						</div>

						<div class="md:col-span-2">
							<label for="direccion" class="block text-sm font-semibold text-gray-700 mb-2">
								Dirección
							</label>
							<input
								id="direccion"
								type="text"
								bind:value={formData.direccion}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Calle 123 #45-67, Barrio Centro"
							/>
						</div>
					</div>

					<button
						type="submit"
						disabled={saving}
						class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-4 px-6 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
					>
						{#if saving}
							<span class="flex items-center justify-center gap-2">
								<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
								Guardando...
							</span>
						{:else}
							Guardar Cliente
						{/if}
					</button>
				</form>
			</div>

			<!-- Lista de clientes -->
			<div class="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
				<div class="bg-gradient-to-r from-slate-50 to-gray-50 px-6 py-4 border-b border-gray-200">
					<div class="flex items-center justify-between flex-wrap gap-3">
						<div>
							<h2 class="text-xl font-bold text-gray-800">Mis Clientes</h2>
							<p class="text-sm text-gray-600 mt-1">
								{clientes.length} {clientes.length === 1 ? 'cliente registrado' : 'clientes registrados'}
							</p>
						</div>
						{#if clientes.length > 0}
							<div class="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
								{clientes.length}
							</div>
						{/if}
					</div>
				</div>

				<div class="p-6">
					{#if loading}
						<div class="flex flex-col items-center justify-center py-12">
							<div class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
							<p class="text-gray-600 mt-4">Cargando clientes...</p>
						</div>
					{:else if clientes.length === 0}
						<div class="text-center py-12">
							<div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
								<span class="text-4xl">👥</span>
							</div>
							<p class="text-gray-600 mb-2">No hay clientes registrados</p>
							<p class="text-sm text-gray-500">Agrega tu primer cliente usando el formulario de arriba</p>
						</div>
					{:else}
						<div class="grid gap-4 grid-cols-1 lg:grid-cols-2">
							{#each clientes as cliente (cliente.id)}
								<div class="group border-2 border-gray-100 rounded-xl p-5 hover:border-blue-200 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-white to-gray-50">
									<div class="flex justify-between items-start gap-3 mb-3">
										<div class="flex-1 min-w-0">
											<h3 class="text-lg font-bold text-gray-900 mb-1 break-words">{cliente.nombre}</h3>
											<div class="space-y-1.5 text-sm text-gray-600">
												{#if cliente.cedula}
													<div class="flex items-center gap-2">
														<span class="font-medium text-gray-500">CC:</span>
														<span class="break-all">{cliente.cedula}</span>
													</div>
												{/if}
												{#if cliente.telefono}
													<div class="flex items-center gap-2">
														<span class="font-medium text-gray-500">Tel:</span>
														<a href="tel:{cliente.telefono}" class="text-blue-600 hover:underline break-all">{cliente.telefono}</a>
													</div>
												{/if}
												{#if cliente.direccion}
													<div class="flex items-start gap-2">
														<span class="font-medium text-gray-500">Dir:</span>
														<span class="text-xs break-words">{cliente.direccion}</span>
													</div>
												{/if}
											</div>
										</div>

										<button
											on:click={() => eliminarCliente(cliente.id)}
											class="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
											title="Eliminar cliente"
										>
											✕
										</button>
									</div>

									<div class="pt-3 border-t border-gray-100">
										<span class="text-xs text-gray-400">
											Creado: {new Date(cliente.created_at).toLocaleDateString()}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
