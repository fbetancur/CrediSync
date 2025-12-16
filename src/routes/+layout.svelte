<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { isAuthenticated } from '$lib/stores/simple-auth.js';
	import UserHeader from '$lib/components/UserHeader.svelte';
	
	// Rutas que no requieren autenticación
	const publicRoutes = ['/login'];
	
	let mounted = false;
	
	// Verificar autenticación al cargar la app
	onMount(async () => {
		mounted = true;
		
		// Limpiar estado corrupto de Supabase si existe
		try {
			// Verificar si hay errores de token en localStorage
			const supabaseAuth = localStorage.getItem('sb-hmnlriywocnpiktflehr-auth-token');
			if (supabaseAuth) {
				const authData = JSON.parse(supabaseAuth);
				// Si el token está expirado o corrupto, limpiar
				if (authData.expires_at && authData.expires_at < Date.now() / 1000) {
					console.log('🧹 Limpiando token expirado');
					localStorage.removeItem('sb-hmnlriywocnpiktflehr-auth-token');
					sessionStorage.clear();
				}
			}
		} catch (error) {
			console.log('🧹 Limpiando storage corrupto');
			localStorage.removeItem('sb-hmnlriywocnpiktflehr-auth-token');
			sessionStorage.clear();
		}
		
		// Si no hay sesión y no estamos en login, redirigir
		if (!$isAuthenticated && !publicRoutes.includes($page.url.pathname)) {
			goto('/login');
		}
	});
	
	// Verificar autenticación solo después de montar
	$: if (mounted && browser && $page.url.pathname && !$isAuthenticated && !publicRoutes.includes($page.url.pathname)) {
		goto('/login');
	}
</script>

<div class="app">
	{#if $isAuthenticated}
		<UserHeader />
	{/if}
	
	<main class:with-header={$isAuthenticated}>
		<slot />
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background-color: #f9fafb;
	}
	
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	
	main {
		flex: 1;
		min-height: 100vh;
	}
	
	main.with-header {
		min-height: calc(100vh - 60px);
	}
</style>