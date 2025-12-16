<script>
	import { onMount } from 'svelte';
	
	let { 
		open = $bindable(false),
		title = '',
		maxWidth = '90%',
		children 
	} = $props();
	
	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) {
			open = false;
		}
	}
	
	function handleKeydown(e) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
	
	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if open}
	<div class="modal-backdrop" onclick={handleBackdropClick}>
		<div class="modal-content" style="max-width: {maxWidth}">
			<div class="modal-header">
				<h2>{title}</h2>
				<button class="btn-close" onclick={() => open = false}>✕</button>
			</div>
			<div class="modal-body">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.15s ease-out;
	}
	
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	
	.modal-content {
		background: white;
		border-radius: 12px;
		width: 100%;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.15s ease-out;
	}
	
	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
	
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #e5e7eb;
		flex-shrink: 0;
	}
	
	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: #1e293b;
	}
	
	.btn-close {
		width: 32px;
		height: 32px;
		border: none;
		background: #f1f5f9;
		border-radius: 8px;
		color: #64748b;
		font-size: 1.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}
	
	.btn-close:hover {
		background: #e2e8f0;
		color: #1e293b;
	}
	
	.modal-body {
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1;
	}
</style>
