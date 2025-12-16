/**
 * Utilidades para manejo de errores de sincronización
 */

/**
 * Obtener nombre legible del registro
 */
export function getNombreRegistro(table, data, registro) {
	switch (table) {
		case 'clientes':
			return registro?.nombre || data.nombre || 'Cliente desconocido';
		case 'creditos':
			return `Crédito de ${data.cliente_nombre || registro?.cliente_nombre || 'cliente desconocido'}`;
		case 'pagos':
			return `Pago de $${data.monto || 0}`;
		case 'productos':
			return registro?.nombre || data.nombre || 'Producto desconocido';
		default:
			return 'Registro desconocido';
	}
}

/**
 * Obtener mensaje de error legible
 */
export function getMensajeErrorLegible(error) {
	if (!error) return 'Error desconocido';

	const errorLower = error.toLowerCase();

	if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('failed to fetch')) {
		return 'Sin conexión a internet';
	}

	if (errorLower.includes('500') || errorLower.includes('503')) {
		return 'Error temporal del servidor';
	}

	if (errorLower.includes('400') || errorLower.includes('validation')) {
		return 'Datos inválidos o incompletos';
	}

	if (errorLower.includes('401') || errorLower.includes('unauthorized')) {
		return 'Sesión expirada, inicia sesión nuevamente';
	}

	if (errorLower.includes('404')) {
		return 'Registro no encontrado en el servidor';
	}

	if (errorLower.includes('timeout')) {
		return 'Tiempo de espera agotado';
	}

	return error;
}

/**
 * Obtener tipo de error
 */
export function getTipoError(error) {
	if (!error) return 'unknown';

	const errorLower = error.toLowerCase();

	if (errorLower.includes('network') || errorLower.includes('fetch') || errorLower.includes('failed to fetch')) {
		return 'network';
	}

	if (errorLower.includes('500') || errorLower.includes('503')) {
		return 'server';
	}

	if (errorLower.includes('400') || errorLower.includes('validation')) {
		return 'validation';
	}

	return 'unknown';
}

/**
 * Obtener registro de la base de datos
 */
export async function obtenerRegistro(table, id) {
	try {
		const { db } = await import('$lib/db/local.js');
		return await db[table].get(id);
	} catch (err) {
		console.error('Error obteniendo registro:', err);
		return null;
	}
}

/**
 * Obtener texto de operación
 */
export function getOperacionTexto(operation) {
	switch (operation) {
		case 'insert':
			return 'Crear';
		case 'update':
			return 'Actualizar';
		case 'delete':
			return 'Eliminar';
		default:
			return operation;
	}
}

/**
 * Obtener texto de tabla
 */
export function getTablaTexto(table) {
	switch (table) {
		case 'clientes':
			return 'Cliente';
		case 'creditos':
			return 'Crédito';
		case 'pagos':
			return 'Pago';
		case 'productos':
			return 'Producto';
		default:
			return table;
	}
}
