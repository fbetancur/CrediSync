<script>
	import { page } from '$app/stores';
	
	const menuItems = [
		{ href: '/productos', icon: '💳', label: 'Productos' },
		{ href: '/clientes', icon: '👥', label: 'Clientes' },
		{ href: '/clientes/nuevo', icon: '➕', label: 'Nuevo' },
		{ href: '/otorgar-credito', icon: '💰', label: 'Crédito' },
		{ href: '/debug', icon: '🔧', label: 'Debug' }
	];
</script>

<nav class="bottom-menu">
	{#each menuItems as item}
		<a 
			href={item.href} 
			class="menu-item"
			class:active={$page.url.pathname === item.href}
		>
			<span class="icon">{item.icon}</span>
			<span class="label">{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.bottom-menu {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		background: white;
		border-top: 1px solid #e5e7eb;
		padding: 8px 0;
		z-index: 50;
	}

	.menu-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px;
		text-decoration: none;
		color: #6b7280;
		transition: color 0.2s;
	}

	.menu-item.active {
		color: #3b82f6;
	}

	.icon {
		font-size: 20px;
		margin-bottom: 4px;
	}

	.label {
		font-size: 12px;
	}
</style>