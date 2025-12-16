/**
 * Tests Unitarios - Validaciones
 * Fase 8: Tests de Validación de Datos
 */

import { describe, it, expect } from 'vitest';
import {
	validarCliente,
	validarCredito,
	validarCuota,
	validarPago,
	validarDistribucionPago
} from './validaciones.js';

describe('validarCliente', () => {
	it('debe validar cliente correcto', () => {
		const cliente = {
			nombre: 'Juan Pérez',
			creditos_activos: 1,
			saldo_total: 1200,
			dias_atraso_max: 0,
			estado: 'AL_DIA',
			score: 'CONFIABLE'
		};

		expect(() => validarCliente(cliente)).not.toThrow();
	});

	it('debe rechazar creditos_activos negativo', () => {
		const cliente = {
			nombre: 'Juan Pérez',
			creditos_activos: -1,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		expect(() => validarCliente(cliente)).toThrow('creditos_activos no puede ser negativo');
	});

	it('debe rechazar saldo_total negativo', () => {
		const cliente = {
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: -100,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		expect(() => validarCliente(cliente)).toThrow('saldo_total no puede ser negativo');
	});

	it('debe rechazar dias_atraso_max negativo', () => {
		const cliente = {
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: -5,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		expect(() => validarCliente(cliente)).toThrow('dias_atraso_max no puede ser negativo');
	});

	it('debe rechazar estado inválido', () => {
		const cliente = {
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'INVALIDO',
			score: 'REGULAR'
		};

		expect(() => validarCliente(cliente)).toThrow('estado debe ser uno de');
	});

	it('debe rechazar score inválido', () => {
		const cliente = {
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'INVALIDO'
		};

		expect(() => validarCliente(cliente)).toThrow('score debe ser uno de');
	});

	it('debe rechazar nombre vacío', () => {
		const cliente = {
			nombre: '',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		expect(() => validarCliente(cliente)).toThrow('nombre es requerido');
	});
});

describe('validarCredito', () => {
	it('debe validar crédito correcto', () => {
		const credito = {
			cliente_id: 'c1',
			monto_original: 1000,
			numero_cuotas: 20,
			saldo_pendiente: 1200,
			cuotas_pagadas: 0,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).not.toThrow();
	});

	it('debe rechazar saldo_pendiente negativo', () => {
		const credito = {
			cliente_id: 'c1',
			monto_original: 1000,
			numero_cuotas: 20,
			saldo_pendiente: -100,
			cuotas_pagadas: 0,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).toThrow('saldo_pendiente no puede ser negativo');
	});

	it('debe rechazar cuotas_pagadas negativo', () => {
		const credito = {
			cliente_id: 'c1',
			monto_original: 1000,
			numero_cuotas: 20,
			saldo_pendiente: 1200,
			cuotas_pagadas: -1,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).toThrow('cuotas_pagadas no puede ser negativo');
	});

	it('debe rechazar cuotas_pagadas mayor que numero_cuotas', () => {
		const credito = {
			cliente_id: 'c1',
			monto_original: 1000,
			numero_cuotas: 20,
			saldo_pendiente: 0,
			cuotas_pagadas: 25,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).toThrow('cuotas_pagadas');
	});

	it('debe rechazar dias_atraso negativo', () => {
		const credito = {
			cliente_id: 'c1',
			monto_original: 1000,
			numero_cuotas: 20,
			saldo_pendiente: 1200,
			cuotas_pagadas: 0,
			dias_atraso: -5
		};

		expect(() => validarCredito(credito)).toThrow('dias_atraso no puede ser negativo');
	});

	it('debe rechazar cliente_id faltante', () => {
		const credito = {
			monto_original: 1000,
			numero_cuotas: 20,
			saldo_pendiente: 1200,
			cuotas_pagadas: 0,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).toThrow('cliente_id es requerido');
	});

	it('debe rechazar monto_original inválido', () => {
		const credito = {
			cliente_id: 'c1',
			monto_original: 0,
			numero_cuotas: 20,
			saldo_pendiente: 0,
			cuotas_pagadas: 0,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).toThrow('monto_original debe ser mayor a 0');
	});
});

describe('validarCuota', () => {
	it('debe validar cuota correcta', () => {
		const cuota = {
			credito_id: 'c1',
			numero: 1,
			monto_programado: 60,
			monto_pagado: 30,
			saldo_pendiente: 30,
			estado: 'PARCIAL',
			dias_atraso: 0
		};

		expect(() => validarCuota(cuota)).not.toThrow();
	});

	it('debe rechazar monto_pagado negativo', () => {
		const cuota = {
			credito_id: 'c1',
			numero: 1,
			monto_programado: 60,
			monto_pagado: -10,
			saldo_pendiente: 70,
			estado: 'PENDIENTE',
			dias_atraso: 0
		};

		expect(() => validarCuota(cuota)).toThrow('monto_pagado no puede ser negativo');
	});

	it('debe rechazar monto_pagado mayor que monto_programado', () => {
		const cuota = {
			credito_id: 'c1',
			numero: 1,
			monto_programado: 60,
			monto_pagado: 70,
			saldo_pendiente: -10,
			estado: 'PAGADA',
			dias_atraso: 0
		};

		expect(() => validarCuota(cuota)).toThrow('monto_pagado');
	});

	it('debe rechazar saldo_pendiente negativo', () => {
		const cuota = {
			credito_id: 'c1',
			numero: 1,
			monto_programado: 60,
			monto_pagado: 60,
			saldo_pendiente: -5,
			estado: 'PAGADA',
			dias_atraso: 0
		};

		expect(() => validarCuota(cuota)).toThrow('saldo_pendiente no puede ser negativo');
	});

	it('debe rechazar estado inválido', () => {
		const cuota = {
			credito_id: 'c1',
			numero: 1,
			monto_programado: 60,
			monto_pagado: 0,
			saldo_pendiente: 60,
			estado: 'INVALIDO',
			dias_atraso: 0
		};

		expect(() => validarCuota(cuota)).toThrow('estado debe ser uno de');
	});
});

describe('validarPago', () => {
	it('debe validar pago correcto', () => {
		const pago = {
			monto: 100,
			credito_id: 'c1',
			cliente_id: 'cl1',
			fecha: '2025-12-08'
		};

		expect(() => validarPago(pago)).not.toThrow();
	});

	it('debe rechazar monto inválido', () => {
		const pago = {
			monto: 0,
			credito_id: 'c1',
			cliente_id: 'cl1',
			fecha: '2025-12-08'
		};

		expect(() => validarPago(pago)).toThrow('monto debe ser mayor a 0');
	});

	it('debe rechazar credito_id faltante', () => {
		const pago = {
			monto: 100,
			cliente_id: 'cl1',
			fecha: '2025-12-08'
		};

		expect(() => validarPago(pago)).toThrow('credito_id es requerido');
	});

	it('debe rechazar fecha faltante', () => {
		const pago = {
			monto: 100,
			credito_id: 'c1',
			cliente_id: 'cl1'
		};

		expect(() => validarPago(pago)).toThrow('fecha es requerida');
	});
});

describe('validarDistribucionPago', () => {
	it('debe validar distribución correcta', () => {
		const pago = { monto: 100 };
		const cuotasOriginales = [
			{ id: '1', monto_programado: 60, monto_pagado: 0 },
			{ id: '2', monto_programado: 60, monto_pagado: 0 }
		];
		const cuotasActualizadas = [
			{ id: '1', monto_programado: 60, monto_pagado: 60 },
			{ id: '2', monto_programado: 60, monto_pagado: 40 }
		];

		expect(() =>
			validarDistribucionPago(pago, cuotasActualizadas, cuotasOriginales)
		).not.toThrow();
	});

	it('debe rechazar monto aplicado negativo', () => {
		const pago = { monto: 100 };
		const cuotasOriginales = [{ id: '1', monto_programado: 60, monto_pagado: 50 }];
		const cuotasActualizadas = [{ id: '1', monto_programado: 60, monto_pagado: 40 }];

		expect(() => validarDistribucionPago(pago, cuotasActualizadas, cuotasOriginales)).toThrow(
			'Monto aplicado negativo'
		);
	});

	it('debe rechazar cuando suma no coincide con monto del pago', () => {
		const pago = { monto: 100 };
		const cuotasOriginales = [{ id: '1', monto_programado: 60, monto_pagado: 0 }];
		const cuotasActualizadas = [{ id: '1', monto_programado: 60, monto_pagado: 50 }];

		expect(() => validarDistribucionPago(pago, cuotasActualizadas, cuotasOriginales)).toThrow(
			'no coincide con monto del pago'
		);
	});

	it('debe rechazar cuando monto pagado excede monto programado', () => {
		const pago = { monto: 100 };
		const cuotasOriginales = [{ id: '1', monto_programado: 60, monto_pagado: 0 }];
		const cuotasActualizadas = [{ id: '1', monto_programado: 60, monto_pagado: 70 }];

		expect(() => validarDistribucionPago(pago, cuotasActualizadas, cuotasOriginales)).toThrow(
			'Monto pagado excede monto programado'
		);
	});
});
