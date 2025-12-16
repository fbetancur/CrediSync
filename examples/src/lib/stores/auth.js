import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase.js';

export const user = writable(null);

// Inicializar sesión
supabase.auth.getSession().then(({ data }) => {
	user.set(data.session?.user ?? null);
});

// Escuchar cambios de autenticación
supabase.auth.onAuthStateChange((_, session) => {
	user.set(session?.user ?? null);
});

// Funciones de auth
export const auth = {
	async signIn(email, password) {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password
		});
		return { data, error };
	},

	async signUp(email, password) {
		const { data, error } = await supabase.auth.signUp({
			email,
			password
		});
		return { data, error };
	},

	async signOut() {
		const { error } = await supabase.auth.signOut();
		return { error };
	}
};
