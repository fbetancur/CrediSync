<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import BottomMenu from '$lib/components/BottomMenu.svelte';

	onMount(() => {
		// Redirigir automáticamente a productos solo en el cliente
		if (browser) {
			setTimeout(() => {
				goto('/productos');
			}, 100);
		}
	});
</script>

<div class="page">
	<div class="welcome">
		<h1>CrediSync Foundation</h1>
		<p>Aplicación de Microcréditos Offline-First</p>
		<div class="loading">Cargando...</div>
	</div>
</div>

<BottomMenu />

<style>
	.page {
		padding: 20px 20px 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 80vh;
	}
	
	.welcome {
		text-align: center;
	}
	
	.welcome h1 {
		color: #1f2937;
		margin-bottom: 12px;
	}
	
	.welcome p {
		color: #6b7280;
		margin-bottom: 24px;
	}
	
	.loading {
		color: #3b82f6;
	}
</style>
