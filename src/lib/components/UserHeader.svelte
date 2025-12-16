<script>
	import { userContext, logout } from '$lib/stores/optimized-auth.js';
	import { goto } from '$app/navigation';

	function handleLogout() {
		logout();
		goto('/login');
	}

	/**
	 * @param {string} role
	 */
	function getRoleBadgeClass(role) {
		/** @type {Record<string, string>} */
		const classes = {
			cobrador: 'badge-cobrador',
			user: 'badge-cobrador',
			supervisor: 'badge-supervisor',
			manager: 'badge-supervisor', 
			admin: 'badge-admin',
			superadmin: 'badge-superadmin'
		};
		return classes[role] || 'badge-cobrador';
	}

	/**
	 * @param {string} role
	 */
	function getRoleName(role) {
		/** @type {Record<string, string>} */
		const names = {
			cobrador: 'Cobrador',
			user: 'Cobrador',
			supervisor: 'Supervisor',
			manager: 'Supervisor',
			admin: 'Administrador',
			superadmin: 'Super Admin'
		};
		return names[role] || 'Usuario';
	}
</script>

{#if $userContext}
	<header class="user-header">
		<div class="user-info">
			<div class="user-details">
				<span class="user-name">{$userContext.full_name}</span>
				<span class="company-name">{$userContext.tenant_name}</span>
			</div>
			<div class="role-badge {getRoleBadgeClass($userContext.role)}">
				{getRoleName($userContext.role)}
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

	.badge-cobrador { 
		background: #dbeafe; 
		color: #1e40af; 
	}
	
	.badge-supervisor { 
		background: #fef3c7; 
		color: #92400e; 
	}
	
	.badge-admin { 
		background: #dcfce7; 
		color: #166534; 
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