/**
 * Tests Unitarios - Funciones de Cálculo
 * Fase 8: Tests de Performance y Correctitud
 */

import { describe, it, expect } from 'vitest';
import {
	calcularCamposCliente,
	calcularCamposCredito,
	distribuirPagoEntreCuotas,
	calcularCuotasProgramadas,
	calcularSaldoPendiente,
	calcularDiasAtraso
} from './creditos.js';

describe('calcularCamposCliente', () => {
	it('debe retornar valores iniciales con 0 créditos', () => {
		const cliente = { id: '1', nombre: 'Test' };
		const creditos = [];
		const pagosPorCredito = {};

		const resultado = calcularCamposCliente(cliente, creditos, pagosPorCredito);

		expect(resultado.creditos_activos).toBe(0);
		expect(resultado.saldo_total).toBe(0);
		expect(resultado.dias_atraso_max).toBe(0);
		expect(resultado.estado).toBe('SIN_CREDITOS');
		expect(resultado.score).toBe('REGULAR');
	});

	it('debe calcular correctamente con 1 crédito activo sin pagos', () => {
		const cliente = { id: '1', nombre: 'Test' };
		const creditos = [
			{
				id: 'c1',
				estado: 'ACTIVO',
				total_a_pagar: 1200,
				numero_cuotas: 20,
				valor_cuota: 60,
				frecuencia: 'DIARIO',
				fecha_primera_cuota: '2026-01-01' // Fecha futura para evitar mora
			}
		];
		const pagosPorCredito = { c1: [] };

		const resultado = calcularCamposCliente(cliente, creditos, pagosPorCredito);

		expect(resultado.creditos_activos).toBe(1);
		expect(resultado.saldo_total).toBe(1200);
		expect(resultado.estado).toBe('AL_DIA'); // Sin atraso si no hay cuotas vencidas
		expect(resultado.score).toBe('CONFIABLE');
	});

	it('debe calcular correctamente con múltiples créditos', () => {
		const cliente = { id: '1', nombre: 'Test' };
		const creditos = [
			{
				id: 'c1',
				estado: 'ACTIVO',
				total_a_pagar: 1200,
				numero_cuotas: 20,
				valor_cuota: 60,
				frecuencia: 'DIARIO',
				fecha_primera_cuota: '2025-12-01'
			},
			{
				id: 'c2',
				estado: 'ACTIVO',
				total_a_pagar: 600,
				numero_cuotas: 10,
				valor_cuota: 60,
				frecuencia: 'DIARIO',
				fecha_primera_cuota: '2025-12-01'
			}
		];
		const pagosPorCredito = { c1: [], c2: [] };

		const resultado = calcularCamposCliente(cliente, creditos, pagosPorCredito);

		expect(resultado.creditos_activos).toBe(2);
		expect(resultado.saldo_total).toBe(1800);
	});

	it('debe ignorar créditos inactivos', () => {
		const cliente = { id: '1', nombre: 'Test' };
		const creditos = [
			{
				id: 'c1',
				estado: 'CANCELADO',
				total_a_pagar: 1200,
				numero_cuotas: 20,
				valor_cuota: 60,
				frecuencia: 'DIARIO',
				fecha_primera_cuota: '2025-12-01'
			}
		];
		const pagosPorCredito = { c1: [] };

		const resultado = calcularCamposCliente(cliente, creditos, pagosPorCredito);

		expect(resultado.creditos_activos).toBe(0);
		expect(resultado.saldo_total).toBe(0);
		expect(resultado.estado).toBe('SIN_CREDITOS');
	});

	it('debe garantizar que valores nunca sean negativos', () => {
		const cliente = { id: '1', nombre: 'Test' };
		const creditos = [
			{
				id: 'c1',
				estado: 'ACTIVO',
				total_a_pagar: 100,
				numero_cuotas: 2,
				valor_cuota: 50,
				frecuencia: 'DIARIO',
				fecha_primera_cuota: '2025-12-01'
			}
		];
		// Pago excesivo (más del total)
		const pagosPorCredito = { c1: [{ monto: 150 }] };

		const resultado = calcularCamposCliente(cliente, creditos, pagosPorCredito);

		expect(resultado.saldo_total).toBeGreaterThanOrEqual(0);
		expect(resultado.dias_atraso_max).toBeGreaterThanOrEqual(0);
	});
});

describe('calcularCamposCredito', () => {
	it('debe calcular correctamente sin pagos', () => {
		const credito = {
			id: 'c1',
			total_a_pagar: 1200,
			numero_cuotas: 20,
			valor_cuota: 60
		};
		const cuotas = [
			{
				numero: 1,
				monto_programado: 60,
				monto_pagado: 0,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-09'
			},
			{
				numero: 2,
				monto_programado: 60,
				monto_pagado: 0,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-10'
			}
		];
		const pagos = [];

		const resultado = calcularCamposCredito(credito, cuotas, pagos);

		expect(resultado.saldo_pendiente).toBe(1200);
		expect(resultado.cuotas_pagadas).toBe(0);
		expect(resultado.dias_atraso).toBe(0);
	});

	it('debe calcular correctamente con pagos parciales', () => {
		const credito = {
			id: 'c1',
			total_a_pagar: 1200,
			numero_cuotas: 20,
			valor_cuota: 60
		};
		const cuotas = [
			{
				numero: 1,
				monto_programado: 60,
				monto_pagado: 60,
				estado: 'PAGADA',
				fecha_programada: '2025-12-01'
			},
			{
				numero: 2,
				monto_programado: 60,
				monto_pagado: 30,
				estado: 'PARCIAL',
				fecha_programada: '2025-12-02'
			}
		];
		const pagos = [{ monto: 90 }];

		const resultado = calcularCamposCredito(credito, cuotas, pagos);

		expect(resultado.saldo_pendiente).toBe(1110);
		expect(resultado.cuotas_pagadas).toBe(1);
	});

	it('debe garantizar que valores nunca sean negativos', () => {
		const credito = {
			id: 'c1',
			total_a_pagar: 100,
			numero_cuotas: 2,
			valor_cuota: 50
		};
		const cuotas = [
			{
				numero: 1,
				monto_programado: 50,
				monto_pagado: 50,
				estado: 'PAGADA',
				fecha_programada: '2025-12-01'
			},
			{
				numero: 2,
				monto_programado: 50,
				monto_pagado: 50,
				estado: 'PAGADA',
				fecha_programada: '2025-12-02'
			}
		];
		const pagos = [{ monto: 100 }];

		const resultado = calcularCamposCredito(credito, cuotas, pagos);

		expect(resultado.saldo_pendiente).toBeGreaterThanOrEqual(0);
		expect(resultado.cuotas_pagadas).toBeGreaterThanOrEqual(0);
		expect(resultado.dias_atraso).toBeGreaterThanOrEqual(0);
	});
});

describe('distribuirPagoEntreCuotas', () => {
	it('debe distribuir pago completo en una cuota', () => {
		const pago = { monto: 60 };
		const cuotas = [
			{
				id: '1',
				numero: 1,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-09'
			}
		];

		const resultado = distribuirPagoEntreCuotas(pago, cuotas);

		expect(resultado).toHaveLength(1);
		expect(resultado[0].monto_pagado).toBe(60);
		expect(resultado[0].saldo_pendiente).toBe(0);
		expect(resultado[0].estado).toBe('PAGADA');
	});

	it('debe distribuir pago entre múltiples cuotas', () => {
		const pago = { monto: 150 };
		const cuotas = [
			{
				id: '1',
				numero: 1,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-01'
			},
			{
				id: '2',
				numero: 2,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-02'
			},
			{
				id: '3',
				numero: 3,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-03'
			}
		];

		const resultado = distribuirPagoEntreCuotas(pago, cuotas);

		expect(resultado).toHaveLength(3);
		expect(resultado[0].estado).toBe('PAGADA');
		expect(resultado[1].estado).toBe('PAGADA');
		expect(resultado[2].estado).toBe('PARCIAL');
		expect(resultado[2].monto_pagado).toBe(30);
	});

	it('debe lanzar error si monto es negativo o cero', () => {
		const pago = { monto: 0 };
		const cuotas = [
			{
				id: '1',
				numero: 1,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-09'
			}
		];

		expect(() => distribuirPagoEntreCuotas(pago, cuotas)).toThrow(
			'El monto del pago debe ser mayor a 0'
		);
	});

	it('debe manejar cuotas parcialmente pagadas', () => {
		const pago = { monto: 60 };
		const cuotas = [
			{
				id: '1',
				numero: 1,
				monto_programado: 60,
				monto_pagado: 30,
				saldo_pendiente: 30,
				estado: 'PARCIAL',
				fecha_programada: '2025-12-01'
			},
			{
				id: '2',
				numero: 2,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-02'
			}
		];

		const resultado = distribuirPagoEntreCuotas(pago, cuotas);

		expect(resultado[0].monto_pagado).toBe(60);
		expect(resultado[0].estado).toBe('PAGADA');
		expect(resultado[1].monto_pagado).toBe(30);
		expect(resultado[1].estado).toBe('PARCIAL');
	});

	it('debe validar que suma de montos aplicados = monto del pago', () => {
		const pago = { monto: 100 };
		const cuotas = [
			{
				id: '1',
				numero: 1,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-01'
			},
			{
				id: '2',
				numero: 2,
				monto_programado: 60,
				monto_pagado: 0,
				saldo_pendiente: 60,
				estado: 'PENDIENTE',
				fecha_programada: '2025-12-02'
			}
		];

		const resultado = distribuirPagoEntreCuotas(pago, cuotas);

		const totalAplicado = resultado.reduce(
			(sum, c) => sum + (c.monto_pagado - (cuotas.find((cp) => cp.id === c.id)?.monto_pagado || 0)),
			0
		);

		expect(Math.abs(totalAplicado - pago.monto)).toBeLessThanOrEqual(0.01);
	});
});

describe('calcularCuotasProgramadas', () => {
	it('debe generar cuotas diarias correctamente', () => {
		const credito = {
			numero_cuotas: 5,
			valor_cuota: 60,
			frecuencia: 'DIARIO',
			fecha_primera_cuota: '2025-12-09',
			excluir_domingos: false
		};

		const cuotas = calcularCuotasProgramadas(credito);

		expect(cuotas).toHaveLength(5);
		expect(cuotas[0].numero).toBe(1);
		expect(cuotas[0].fecha_programada).toBe('2025-12-09');
		expect(cuotas[0].monto_programado).toBe(60);
		expect(cuotas[1].fecha_programada).toBe('2025-12-10');
	});

	it('debe excluir domingos cuando está configurado', () => {
		const credito = {
			numero_cuotas: 3,
			valor_cuota: 60,
			frecuencia: 'DIARIO',
			fecha_primera_cuota: '2025-12-13', // Sábado
			excluir_domingos: true
		};

		const cuotas = calcularCuotasProgramadas(credito);

		expect(cuotas).toHaveLength(3);
		expect(cuotas[0].fecha_programada).toBe('2025-12-13'); // Sábado
		expect(cuotas[1].fecha_programada).toBe('2025-12-15'); // Lunes (salta domingo)
		expect(cuotas[2].fecha_programada).toBe('2025-12-16'); // Martes
	});

	it('debe generar cuotas semanales correctamente', () => {
		const credito = {
			numero_cuotas: 3,
			valor_cuota: 60,
			frecuencia: 'SEMANAL',
			fecha_primera_cuota: '2025-12-09',
			excluir_domingos: false
		};

		const cuotas = calcularCuotasProgramadas(credito);

		expect(cuotas).toHaveLength(3);
		expect(cuotas[0].fecha_programada).toBe('2025-12-09');
		expect(cuotas[1].fecha_programada).toBe('2025-12-16');
		expect(cuotas[2].fecha_programada).toBe('2025-12-23');
	});

	it('debe generar cuotas mensuales correctamente', () => {
		const credito = {
			numero_cuotas: 3,
			valor_cuota: 200,
			frecuencia: 'MENSUAL',
			fecha_primera_cuota: '2025-12-09',
			excluir_domingos: false
		};

		const cuotas = calcularCuotasProgramadas(credito);

		expect(cuotas).toHaveLength(3);
		expect(cuotas[0].fecha_programada).toBe('2025-12-09');
		expect(cuotas[1].fecha_programada).toBe('2026-01-09');
		expect(cuotas[2].fecha_programada).toBe('2026-02-09');
	});
});

describe('calcularSaldoPendiente', () => {
	it('debe calcular saldo sin pagos', () => {
		const credito = { total_a_pagar: 1200 };
		const pagos = [];

		const saldo = calcularSaldoPendiente(credito, pagos);

		expect(saldo).toBe(1200);
	});

	it('debe calcular saldo con pagos parciales', () => {
		const credito = { total_a_pagar: 1200 };
		const pagos = [{ monto: 300 }, { monto: 200 }];

		const saldo = calcularSaldoPendiente(credito, pagos);

		expect(saldo).toBe(700);
	});

	it('debe retornar 0 cuando está completamente pagado', () => {
		const credito = { total_a_pagar: 1200 };
		const pagos = [{ monto: 600 }, { monto: 600 }];

		const saldo = calcularSaldoPendiente(credito, pagos);

		expect(saldo).toBe(0);
	});
});
