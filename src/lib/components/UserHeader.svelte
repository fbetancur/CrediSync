<script>
	import { currentUser, currentTenant, auth } from '$lib/stores/simple-auth.js';
	import { goto } from '$app/navigation';

	async function handleLogout() {
		await auth.signOut();
		goto('/login');
	}

	/**
	 * @param {string} role
	 */
	function getRoleBadgeClass(role) {
		/** @type {Record<string, string>} */
		const classes = {
			admin: 'badge-admin',
			manager: 'badge-manager',
			user: 'badge-user',
			viewer: 'badge-viewer',
			cobrador: 'badge-cobrador', // Mantener compatibilidad
			supervisor: 'badge-supervisor',
			superadmin: 'badge-superadmin'
		};
		return classes[role] || 'badge-user';
	}

	/**
	 * @param {string} role
	 */
	function getRoleName(role) {
		/** @type {Record<string, string>} */
		const names = {
			admin: 'Administrador',
			manager: 'Gerente',
			user: 'Usuario',
			viewer: 'Observador',
			cobrador: 'Cobrador', // Mantener compatibilidad
			supervisor: 'Supervisor',
			superadmin: 'Super Admin'
		};
		return names[role] || 'Usuario';
	}
</script>

{#if $currentUser && $currentTenant}
	<header class="user-header">
		<div class="user-info">
			<div class="user-details">
				<span class="user-name">{$currentUser.nombre}</span>
				<span class="company-name">{$currentTenant.nombre}</span>
			</div>
			<div class="role-badge {getRoleBadgeClass($currentUser.rol)}">
				{getRoleName($currentUser.rol)}
			</div>
		</div>
		
		<button class="logout-btn" on:click={handleLogout} title="Cerrar sesión">
			<span class="logout-icon">👋</span>
		</button>
	</header>
{/if}

<style>
	.user-header {
		background: white;
		border-bottom: 1px solid #e5e7eb;
		padding: 12px 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 40;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.user-details {
		display: flex;
		flex-direction: column;
	}

	.user-name {
		font-weight: 600;
		color: #1f2937;
		font-size: 14px;
	}

	.company-name {
		font-size: 12px;
		color: #6b7280;
	}

	.role-badge {
		padding: 4px 8px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.badge-admin { 
		background: #dcfce7; 
		color: #166534; 
	}
	
	.badge-manager { 
		background: #fef3c7; 
		color: #92400e; 
	}
	
	.badge-user { 
		background: #dbeafe; 
		color: #1e40af; 
	}
	
	.badge-viewer { 
		background: #f3f4f6; 
		color: #374151; 
	}
	
	.badge-cobrador { 
		background: #dbeafe; 
		color: #1e40af; 
	}
	
	.badge-supervisor { 
		background: #fef3c7; 
		color: #92400e; 
	}
	
	.badge-superadmin { 
		background: #fce7f3; 
		color: #be185d; 
	}

	.logout-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 8px;
		border-radius: 6px;
		transition: background-color 0.2s;
	}

	.logout-btn:hover {
		background: #f3f4f6;
	}

	.logout-icon {
		font-size: 18px;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.user-header {
			padding: 8px 16px;
		}
		
		.user-name {
			font-size: 13px;
		}
		
		.company-name {
			font-size: 11px;
		}
		
		.role-badge {
			font-size: 10px;
			padding: 3px 6px;
		}
	}
</style>