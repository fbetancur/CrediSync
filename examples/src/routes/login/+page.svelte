<script>
	import { auth } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';

	let email = '';
	let password = '';
	let loading = false;
	let error = '';
	let isSignUp = false;

	async function handleSubmit() {
		loading = true;
		error = '';

		const { error: authError } = isSignUp
			? await auth.signUp(email, password)
			: await auth.signIn(email, password);

		loading = false;

		if (authError) {
			error = authError.message;
		} else {
			if (isSignUp) {
				error = 'Revisa tu email para confirmar la cuenta';
			} else {
				goto('/');
			}
		}
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
	<div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
		<div class="text-center mb-8">
			<div class="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
				<span class="text-white font-bold text-3xl">C</span>
			</div>
			<h1 class="text-3xl font-bold text-gray-800 mb-2">
				{isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
			</h1>
			<p class="text-sm text-gray-600">
				{isSignUp ? 'Regístrate para comenzar' : 'Bienvenido a CrediSync360'}
			</p>
		</div>

		<form on:submit|preventDefault={handleSubmit} class="space-y-5">
			<div>
				<label for="email" class="block text-sm font-semibold text-gray-700 mb-2">
					Email
				</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
					placeholder="tu@email.com"
				/>
			</div>

			<div>
				<label for="password" class="block text-sm font-semibold text-gray-700 mb-2">
					Contraseña
				</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					minlength="6"
					class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
					placeholder="••••••••"
				/>
				{#if isSignUp}
					<p class="text-xs text-gray-500 mt-2">Mínimo 6 caracteres</p>
				{/if}
			</div>

			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-xl p-4">
					<p class="text-sm text-red-600">{error}</p>
				</div>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3.5 px-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
			>
				{#if loading}
					<span class="flex items-center justify-center gap-2">
						<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
						Cargando...
					</span>
				{:else}
					{isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
				{/if}
			</button>
		</form>

		<div class="mt-6 text-center">
			<button
				type="button"
				on:click={() => {
					isSignUp = !isSignUp;
					error = '';
				}}
				class="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium transition-colors"
			>
				{isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
			</button>
		</div>
	</div>
</div>
