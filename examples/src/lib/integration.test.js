/**
 * Tests de Integración E2E
 * Fase 9: Tests de Flujos Completos
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	calcularCamposCliente,
	calcularCamposCredito,
	distribuirPagoEntreCuotas,
	calcularCuotasProgramadas
} from './utils/creditos.js';
import { validarCliente, validarCredito, validarCuota, validarPago } from './utils/validaciones.js';

describe('Flujo E2E: Cliente → Crédito → Pago', () => {
	let cliente;
	let credito;
	let cuotas;

	beforeEach(() => {
		// Simular creación de cliente
		cliente = {
			id: 'cliente-1',
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		// Simular creación de crédito
		credito = {
			id: 'credito-1',
			cliente_id: 'cliente-1',
			monto_original: 1000,
			interes_porcentaje: 20,
			total_a_pagar: 1200,
			numero_cuotas: 20,
			valor_cuota: 60,
			frecuencia: 'DIARIO',
			fecha_primera_cuota: '2025-12-09',
			estado: 'ACTIVO',
			saldo_pendiente: 1200,
			cuotas_pagadas: 0,
			dias_atraso: 0
		};

		// Generar cuotas
		const cuotasProgramadas = calcularCuotasProgramadas(credito);
		cuotas = cuotasProgramadas.map((c, i) => ({
			id: `cuota-${i + 1}`,
			credito_id: credito.id,
			numero: c.numero,
			fecha_programada: c.fecha_programada,
			monto_programado: c.monto_programado,
			monto_pagado: 0,
			saldo_pendiente: c.monto_programado,
			estado: 'PENDIENTE',
			dias_atraso: 0
		}));
	});

	it('debe completar flujo: crear cliente → otorgar crédito → actualizar cliente', () => {
		// 1. Validar cliente inicial
		expect(() => validarCliente(cliente)).not.toThrow();
		expect(cliente.creditos_activos).toBe(0);
		expect(cliente.estado).toBe('SIN_CREDITOS');

		// 2. Validar crédito
		expect(() => validarCredito(credito)).not.toThrow();
		expect(credito.saldo_pendiente).toBe(1200);

		// 3. Validar cuotas generadas
		expect(cuotas).toHaveLength(20);
		cuotas.forEach((cuota) => {
			expect(() => validarCuota(cuota)).not.toThrow();
			expect(cuota.estado).toBe('PENDIENTE');
		});

		// 4. Actualizar cliente después de otorgar crédito
		const camposCliente = calcularCamposCliente(cliente, [credito], { [credito.id]: [] });

		expect(camposCliente.creditos_activos).toBe(1);
		expect(camposCliente.saldo_total).toBe(1200);
		expect(camposCliente.estado).toBe('AL_DIA');
		expect(camposCliente.score).toBe('CONFIABLE');

		// Actualizar cliente
		Object.assign(cliente, camposCliente);
		expect(() => validarCliente(cliente)).not.toThrow();
	});

	it('debe completar flujo: registrar pago → actualizar cuotas → actualizar crédito → actualizar cliente', () => {
		// Estado inicial: cliente con crédito
		Object.assign(
			cliente,
			calcularCamposCliente(cliente, [credito], { [credito.id]: [] })
		);

		// 1. Registrar pago
		const pago = {
			id: 'pago-1',
			credito_id: credito.id,
			cliente_id: cliente.id,
			monto: 180, // 3 cuotas
			fecha: '2025-12-09'
		};

		expect(() => validarPago(pago)).not.toThrow();

		// 2. Distribuir pago entre cuotas
		const cuotasPendientes = cuotas.filter((c) => c.estado !== 'PAGADA');
		const cuotasActualizadas = distribuirPagoEntreCuotas(pago, cuotasPendientes);

		// La función solo retorna las cuotas que recibieron pago (3 cuotas)
		expect(cuotasActualizadas).toHaveLength(3);
		expect(cuotasActualizadas[0].estado).toBe('PAGADA');
		expect(cuotasActualizadas[1].estado).toBe('PAGADA');
		expect(cuotasActualizadas[2].estado).toBe('PAGADA');

		// Actualizar cuotas
		cuotasActualizadas.forEach((cuota) => {
			expect(() => validarCuota(cuota)).not.toThrow();
		});

		// 3. Actualizar crédito
		const camposCredito = calcularCamposCredito(credito, cuotasActualizadas, [pago]);

		expect(camposCredito.saldo_pendiente).toBe(1020);
		expect(camposCredito.cuotas_pagadas).toBe(3);
		expect(camposCredito.dias_atraso).toBe(0);

		Object.assign(credito, camposCredito);
		expect(() => validarCredito(credito)).not.toThrow();

		// 4. Actualizar cliente
		const camposCliente = calcularCamposCliente(cliente, [credito], { [credito.id]: [pago] });

		expect(camposCliente.creditos_activos).toBe(1);
		expect(camposCliente.saldo_total).toBe(1020);
		expect(camposCliente.estado).toBe('AL_DIA');

		Object.assign(cliente, camposCliente);
		expect(() => validarCliente(cliente)).not.toThrow();
	});

	it('debe manejar múltiples pagos correctamente', () => {
		// Estado inicial
		Object.assign(
			cliente,
			calcularCamposCliente(cliente, [credito], { [credito.id]: [] })
		);

		const pagos = [];

		// Pago 1: 120 (2 cuotas)
		const pago1 = {
			id: 'pago-1',
			credito_id: credito.id,
			cliente_id: cliente.id,
			monto: 120,
			fecha: '2025-12-09'
		};
		pagos.push(pago1);

		let cuotasPendientes = cuotas.filter((c) => c.estado !== 'PAGADA');
		let cuotasActualizadas = distribuirPagoEntreCuotas(pago1, cuotasPendientes);

		// Actualizar cuotas con el primer pago - reemplazar las cuotas actualizadas en el array original
		cuotasActualizadas.forEach((cuotaActualizada) => {
			const index = cuotas.findIndex((c) => c.id === cuotaActualizada.id);
			if (index !== -1) {
				cuotas[index] = cuotaActualizada;
			}
		});

		// Pago 2: 180 (3 cuotas)
		const pago2 = {
			id: 'pago-2',
			credito_id: credito.id,
			cliente_id: cliente.id,
			monto: 180,
			fecha: '2025-12-10'
		};
		pagos.push(pago2);

		cuotasPendientes = cuotas.filter((c) => c.estado !== 'PAGADA');
		cuotasActualizadas = distribuirPagoEntreCuotas(pago2, cuotasPendientes);

		// Actualizar cuotas con el segundo pago
		cuotasActualizadas.forEach((cuotaActualizada) => {
			const index = cuotas.findIndex((c) => c.id === cuotaActualizada.id);
			if (index !== -1) {
				cuotas[index] = cuotaActualizada;
			}
		});

		// Verificar estado final - ahora usamos el array completo de cuotas
		expect(cuotas.filter((c) => c.estado === 'PAGADA')).toHaveLength(5);

		// Actualizar crédito - usar el array completo de cuotas
		const camposCredito = calcularCamposCredito(credito, cuotas, pagos);
		expect(camposCredito.saldo_pendiente).toBe(900);
		expect(camposCredito.cuotas_pagadas).toBe(5);

		// Actualizar cliente
		const camposCliente = calcularCamposCliente(cliente, [credito], { [credito.id]: pagos });
		expect(camposCliente.saldo_total).toBe(900);
	});

	it('debe manejar pago completo del crédito', () => {
		// Estado inicial
		Object.assign(
			cliente,
			calcularCamposCliente(cliente, [credito], { [credito.id]: [] })
		);

		// Pago completo
		const pago = {
			id: 'pago-completo',
			credito_id: credito.id,
			cliente_id: cliente.id,
			monto: 1200,
			fecha: '2025-12-09'
		};

		const cuotasPendientes = cuotas.filter((c) => c.estado !== 'PAGADA');
		const cuotasActualizadas = distribuirPagoEntreCuotas(pago, cuotasPendientes);

		// Todas las cuotas deben estar pagadas
		expect(cuotasActualizadas.every((c) => c.estado === 'PAGADA')).toBe(true);

		// Actualizar crédito
		const camposCredito = calcularCamposCredito(credito, cuotasActualizadas, [pago]);
		expect(camposCredito.saldo_pendiente).toBe(0);
		expect(camposCredito.cuotas_pagadas).toBe(20);

		// Actualizar cliente
		const camposCliente = calcularCamposCliente(cliente, [credito], { [credito.id]: [pago] });
		expect(camposCliente.saldo_total).toBe(0);
	});
});

describe('Flujo E2E: Múltiples Créditos', () => {
	it('debe manejar cliente con múltiples créditos', () => {
		const cliente = {
			id: 'cliente-1',
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		const credito1 = {
			id: 'credito-1',
			cliente_id: 'cliente-1',
			total_a_pagar: 1200,
			numero_cuotas: 20,
			valor_cuota: 60,
			frecuencia: 'DIARIO',
			fecha_primera_cuota: '2025-12-09',
			estado: 'ACTIVO',
			monto_original: 1000
		};

		const credito2 = {
			id: 'credito-2',
			cliente_id: 'cliente-1',
			total_a_pagar: 600,
			numero_cuotas: 10,
			valor_cuota: 60,
			frecuencia: 'DIARIO',
			fecha_primera_cuota: '2025-12-09',
			estado: 'ACTIVO',
			monto_original: 500
		};

		const pagosPorCredito = {
			[credito1.id]: [],
			[credito2.id]: []
		};

		const camposCliente = calcularCamposCliente(
			cliente,
			[credito1, credito2],
			pagosPorCredito
		);

		expect(camposCliente.creditos_activos).toBe(2);
		expect(camposCliente.saldo_total).toBe(1800);
		expect(camposCliente.estado).toBe('AL_DIA');
	});
});

describe('Flujo E2E: Validación de Integridad', () => {
	it('debe mantener integridad en todo el flujo', () => {
		// Cliente inicial
		const cliente = {
			id: 'cliente-1',
			nombre: 'Juan Pérez',
			creditos_activos: 0,
			saldo_total: 0,
			dias_atraso_max: 0,
			estado: 'SIN_CREDITOS',
			score: 'REGULAR'
		};

		// Validar en cada paso
		expect(() => validarCliente(cliente)).not.toThrow();

		// Crear crédito
		const credito = {
			id: 'credito-1',
			cliente_id: 'cliente-1',
			monto_original: 1000,
			numero_cuotas: 10,
			total_a_pagar: 1200,
			valor_cuota: 120,
			frecuencia: 'SEMANAL',
			fecha_primera_cuota: '2025-12-09',
			estado: 'ACTIVO',
			saldo_pendiente: 1200,
			cuotas_pagadas: 0,
			dias_atraso: 0
		};

		expect(() => validarCredito(credito)).not.toThrow();

		// Generar cuotas
		const cuotasProgramadas = calcularCuotasProgramadas(credito);
		const cuotas = cuotasProgramadas.map((c, i) => ({
			id: `cuota-${i + 1}`,
			credito_id: credito.id,
			numero: c.numero,
			fecha_programada: c.fecha_programada,
			monto_programado: c.monto_programado,
			monto_pagado: 0,
			saldo_pendiente: c.monto_programado,
			estado: 'PENDIENTE',
			dias_atraso: 0
		}));

		cuotas.forEach((cuota) => {
			expect(() => validarCuota(cuota)).not.toThrow();
		});

		// Actualizar cliente
		Object.assign(
			cliente,
			calcularCamposCliente(cliente, [credito], { [credito.id]: [] })
		);
		expect(() => validarCliente(cliente)).not.toThrow();

		// Registrar pago
		const pago = {
			id: 'pago-1',
			credito_id: credito.id,
			cliente_id: cliente.id,
			monto: 360,
			fecha: '2025-12-09'
		};

		expect(() => validarPago(pago)).not.toThrow();

		// Distribuir pago
		const cuotasActualizadas = distribuirPagoEntreCuotas(pago, cuotas);
		cuotasActualizadas.forEach((cuota) => {
			expect(() => validarCuota(cuota)).not.toThrow();
		});

		// Actualizar crédito
		Object.assign(credito, calcularCamposCredito(credito, cuotasActualizadas, [pago]));
		expect(() => validarCredito(credito)).not.toThrow();

		// Actualizar cliente
		Object.assign(
			cliente,
			calcularCamposCliente(cliente, [credito], { [credito.id]: [pago] })
		);
		expect(() => validarCliente(cliente)).not.toThrow();

		// Verificar integridad final
		expect(cliente.creditos_activos).toBe(1);
		expect(cliente.saldo_total).toBe(840);
		expect(credito.saldo_pendiente).toBe(840);
		expect(credito.cuotas_pagadas).toBe(3);
	});
});
