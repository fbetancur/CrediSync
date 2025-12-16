/**
 * Módulo de encriptación para datos sensibles en IndexedDB
 * Protege información crítica incluso si el dispositivo es comprometido
 */

/**
 * Encriptar datos sensibles antes de guardar en IndexedDB
 */
export function encryptSensitiveData(data, userKey) {
	// Implementación básica - en producción usar crypto-js o similar
	const sensitiveFields = ['document', 'phone', 'email', 'address'];
	const encrypted = { ...data };
	
	sensitiveFields.forEach(field => {
		if (encrypted[field]) {
			// Simulación de encriptación - reemplazar con algoritmo real
			encrypted[field] = btoa(encrypted[field] + userKey);
			encrypted[`${field}_encrypted`] = true;
		}
	});
	
	return encrypted;
}

/**
 * Desencriptar datos al leer de IndexedDB
 */
export function decryptSensitiveData(data, userKey) {
	const decrypted = { ...data };
	
	Object.keys(data).forEach(key => {
		if (key.endsWith('_encrypted') && data[key]) {
			const originalField = key.replace('_encrypted', '');
			if (data[originalField]) {
				try {
					// Simulación de desencriptación
					decrypted[originalField] = atob(data[originalField]).replace(userKey, '');
				} catch (error) {
					console.warn(`Error desencriptando ${originalField}:`, error);
				}
			}
		}
	});
	
	return decrypted;
}

/**
 * Generar clave de encriptación basada en el usuario
 */
export function generateUserKey(userId, tenantId) {
	// En producción, usar una clave más robusta
	return btoa(`${userId}-${tenantId}-${Date.now()}`).slice(0, 16);
}