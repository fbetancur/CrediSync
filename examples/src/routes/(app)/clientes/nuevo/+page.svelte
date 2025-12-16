<script>
	import { goto } from '$app/navigation';
	import { createCliente } from '$lib/sync/clientes.js';
	import { user } from '$lib/stores/auth.js';
	import { isOnline } from '$lib/stores/sync.js';
	
	// Datos del formulario
	let formData = $state({
		nombre: '',
		tipo_documento: 'CURP',
		numero_documento: '',
		telefono: '',
		telefono_2: '',
		direccion: '',
		barrio: '',
		referencia: '',
		nombre_fiador: '',
		telefono_fiador: '',
		latitud: null,
		longitud: null
	});
	
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	
	async function handleSubmit(e) {
		e.preventDefault();
		
		if (!formData.nombre.trim()) {
			error = 'El nombre es requerido';
			return;
		}
		
		loading = true;
		error = '';
		success = false;
		
		try {
			// Preparar datos para insertar (offline-first)
			const clienteData = {
				nombre: formData.nombre.trim(),
				tipo_documento: formData.tipo_documento,
				numero_documento: formData.numero_documento.trim(),
				telefono: formData.telefono.trim(),
				telefono_2: formData.telefono_2?.trim() || '',
				direccion: formData.direccion.trim(),
				barrio: formData.barrio?.trim() || '',
				referencia: formData.referencia?.trim() || '',
				nombre_fiador: formData.nombre_fiador?.trim() || '',
				telefono_fiador: formData.telefono_fiador?.trim() || '',
				latitud: formData.latitud,
				longitud: formData.longitud
			};
			
			// Guardar offline-first (funciona con o sin internet)
			await createCliente(clienteData);
			
			success = true;
			
			// Mostrar mensaje de éxito
			setTimeout(() => {
				goto('/clientes');
			}, 500);
			
		} catch (err) {
			error = err.message || 'Error al guardar el cliente';
			console.error('Error guardando cliente:', err);
		} finally {
			loading = false;
		}
	}
	
	function cancelar() {
		goto('/clientes');
	}
	
	async function obtenerUbicacion() {
		if ('geolocation' in navigator) {
			try {
				const position = await new Promise((resolve, reject) => {
					navigator.geolocation.getCurrentPosition(resolve, reject);
				});
				
				formData.latitud = position.coords.latitude;
				formData.longitud = position.coords.longitude;
			} catch (err) {
				error = 'No se pudo obtener la ubicación';
			}
		} else {
			error = 'Tu dispositivo no soporta geolocalización';
		}
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
	<div class="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

		<!-- Formulario -->
		<div class="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
			<div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-xl font-bold text-white">Nuevo Cliente</h1>
						<p class="text-blue-100 text-sm mt-1">Completa la información del cliente</p>
					</div>
					{#if !$isOnline}
						<div class="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-lg">
							<div class="w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></div>
							<span class="text-white text-xs font-medium">Modo Offline</span>
						</div>
					{/if}
				</div>
			</div>

			<form onsubmit={handleSubmit} class="p-6 space-y-6">
				<!-- Información Personal -->
				<div>
					<h2 class="text-lg font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-600">
						📋 Información Personal
					</h2>
					
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div class="md:col-span-2">
							<label for="nombre" class="block text-sm font-semibold text-gray-700 mb-2">
								Nombre Completo <span class="text-red-500">*</span>
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
							<label for="tipo_documento" class="block text-sm font-semibold text-gray-700 mb-2">
								Tipo de Documento <span class="text-red-500">*</span>
							</label>
							<select
								id="tipo_documento"
								bind:value={formData.tipo_documento}
								required
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
							>
								<option value="CURP">CURP</option>
								<option value="INE">INE</option>
								<option value="Cédula">Cédula</option>
							</select>
						</div>

						<div>
							<label for="numero_documento" class="block text-sm font-semibold text-gray-700 mb-2">
								Número de Documento <span class="text-red-500">*</span>
							</label>
							<input
								id="numero_documento"
								type="text"
								inputmode="text"
								bind:value={formData.numero_documento}
								required
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Ej: PEGJ850101HDFRNN09"
							/>
						</div>

						<div>
							<label for="telefono" class="block text-sm font-semibold text-gray-700 mb-2">
								Teléfono Principal <span class="text-red-500">*</span>
							</label>
							<input
								id="telefono"
								type="tel"
								bind:value={formData.telefono}
								required
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="555-1234"
							/>
						</div>

						<div>
							<label for="telefono_2" class="block text-sm font-semibold text-gray-700 mb-2">
								Teléfono Secundario
							</label>
							<input
								id="telefono_2"
								type="tel"
								bind:value={formData.telefono_2}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="555-5678 (opcional)"
							/>
						</div>
					</div>
				</div>
				
				<!-- Dirección -->
				<div>
					<h2 class="text-lg font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-600">
						📍 Dirección
					</h2>
					
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div class="md:col-span-2">
							<label for="direccion" class="block text-sm font-semibold text-gray-700 mb-2">
								Dirección <span class="text-red-500">*</span>
							</label>
							<input
								id="direccion"
								type="text"
								inputmode="text"
								bind:value={formData.direccion}
								required
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Calle Principal #123"
							/>
						</div>

						<div>
							<label for="barrio" class="block text-sm font-semibold text-gray-700 mb-2">
								Barrio/Colonia
							</label>
							<input
								id="barrio"
								type="text"
								inputmode="text"
								bind:value={formData.barrio}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Centro (opcional)"
							/>
						</div>

						<div>
							<label for="referencia" class="block text-sm font-semibold text-gray-700 mb-2">
								Referencia
							</label>
							<input
								id="referencia"
								type="text"
								bind:value={formData.referencia}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="Frente a la farmacia (opcional)"
							/>
						</div>

						<div class="md:col-span-2">
							<button
								type="button"
								onclick={obtenerUbicacion}
								class="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl hover:bg-green-100 transition-all font-medium"
							>
								📍 Obtener Ubicación GPS
							</button>
							{#if formData.latitud && formData.longitud}
								<p class="mt-2 text-sm text-green-600">
									✅ Ubicación guardada: {formData.latitud.toFixed(6)}, {formData.longitud.toFixed(6)}
								</p>
							{/if}
						</div>
					</div>
				</div>
				
				<!-- Información del Fiador -->
				<div>
					<h2 class="text-lg font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-600">
						👤 Información del Fiador (Opcional)
					</h2>
					
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<label for="nombre_fiador" class="block text-sm font-semibold text-gray-700 mb-2">
								Nombre del Fiador
							</label>
							<input
								id="nombre_fiador"
								type="text"
								bind:value={formData.nombre_fiador}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="María López Sánchez (opcional)"
							/>
						</div>

						<div>
							<label for="telefono_fiador" class="block text-sm font-semibold text-gray-700 mb-2">
								Teléfono del Fiador
							</label>
							<input
								id="telefono_fiador"
								type="tel"
								bind:value={formData.telefono_fiador}
								class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
								placeholder="555-9999 (opcional)"
							/>
						</div>
					</div>
				</div>

				<!-- Mensajes -->
				{#if error}
					<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
						⚠️ {error}
					</div>
				{/if}
				
				{#if success}
					<div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
						✅ Cliente guardado {$isOnline ? 'y sincronizado' : 'localmente. Se sincronizará cuando tengas internet'}
					</div>
				{/if}

				<!-- Botones -->
				<div class="flex gap-4">
					<button
						type="button"
						onclick={cancelar}
						disabled={loading}
						class="flex-1 px-6 py-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={loading}
						class="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-4 px-6 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
					>
						{#if loading}
							<span class="flex items-center justify-center gap-2">
								<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
								Guardando...
							</span>
						{:else}
							Guardar Cliente
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
</div>


