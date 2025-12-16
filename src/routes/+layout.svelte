<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { isAuthenticated, restoreSession } from '$lib/stores/optimized-auth.js';
	import UserHeader from '$lib/components/UserHeader.svelte';
	
	// Rutas que no requieren autenticación
	const publicRoutes = ['/login', '/test-supabase'];
	
	let mounted = false;
	
	// Restaurar sesión al cargar la app
	onMount(() => {
		mounted = true;
		
		try {
			const sessionRestored = restoreSession();
			
			// Si no hay sesión y no estamos en login, redirigir
			if (!sessionRestored && !publicRoutes.includes($page.url.pathname)) {
				goto('/login');
			}
		} catch (error) {
			console.error('Error restaurando sesión:', error);
			// Si hay error, ir al login
			if (!publicRoutes.includes($page.url.pathname)) {
				goto('/login');
			}
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