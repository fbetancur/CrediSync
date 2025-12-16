# Implementation Plan - Generic Roles and User-Level Data Isolation

## Overview
Este plan implementa el sistema de roles genéricos y separación de datos por usuario dentro del mismo tenant, manteniendo compatibilidad con el código existente. Se enfoca en agregar la funcionalidad de scope-based access control sin romper las funcionalidades actuales.

## Implementation Tasks

- [ ] 1. Actualizar estructura de base de datos para roles genéricos
  - Agregar campo `scope` a tabla roles existente
  - Crear los 4 roles genéricos manteniendo compatibilidad con roles actuales
  - Actualizar función `check_permission` para considerar scope
  - _Requirements: 9.1, 9.2_

- [ ] 1.1 Agregar campo scope a tabla roles existente
  - Ejecutar ALTER TABLE para agregar campo `scope` con valores 'own' o 'tenant'
  - Actualizar roles existentes con scope apropiado (admin/manager = 'tenant', otros = 'own')
  - Crear constraint para validar valores de scope
  - _Requirements: 9.2_

- [ ] 1.2 Crear roles genéricos manteniendo compatibilidad
  - Insertar roles genéricos (admin, manager, user, viewer) en tenants existentes
  - Mapear roles existentes a roles genéricos (cobrador -> user)
  - Mantener roles específicos existentes para compatibilidad
  - _Requirements: 9.1_

- [ ]* 1.3 Escribir test de propiedad para roles genéricos
  - **Property 32: Generic role type enforcement**
  - **Validates: Requirements 9.1**

- [ ] 1.4 Actualizar función check_permission para scope
  - Modificar función existente para considerar scope del rol
  - Agregar lógica para filtrado por created_by cuando scope = 'own'
  - Mantener compatibilidad con roles existentes
  - _Requirements: 9.2, 5.1, 5.2_

- [ ]* 1.5 Escribir test de propiedad para scope assignment
  - **Property 33: Role scope assignment rules**
  - **Validates: Requirements 9.2**

- [ ] 2. Actualizar políticas RLS para filtrado por usuario
  - Crear nuevas políticas RLS que consideren tanto tenant_id como created_by
  - Implementar filtrado condicional basado en scope del rol
  - Mantener políticas existentes como fallback
  - _Requirements: 5.1, 5.2, 9.3, 9.4_

- [ ] 2.1 Crear política RLS para scope-based access
  - Implementar política que filtre por created_by cuando scope = 'own'
  - Permitir acceso completo al tenant cuando scope = 'tenant'
  - Aplicar a todas las tablas de datos (clientes, productos, creditos, etc.)
  - _Requirements: 5.1, 5.2_

- [ ]* 2.2 Escribir test de propiedad para own-scope isolation
  - **Property 34: Own-scope user data isolation**
  - **Validates: Requirements 9.3**

- [ ] 2.3 Crear política RLS para tenant-scope access
  - Implementar política que permita acceso a todos los datos del tenant
  - Aplicar solo a usuarios con roles admin y manager
  - Mantener compatibilidad con roles existentes
  - _Requirements: 5.2, 9.4_

- [ ]* 2.4 Escribir test de propiedad para tenant-scope access
  - **Property 35: Tenant-scope cross-user access**
  - **Validates: Requirements 9.4**

- [ ] 3. Actualizar autenticación para incluir scope en JWT
  - Modificar proceso de login para incluir role_scope en JWT token
  - Actualizar funciones de autenticación existentes
  - Asegurar compatibilidad con sistema actual
  - _Requirements: 5.1, 5.2, 9.2_

- [ ] 3.1 Modificar loginWithSupabaseAuth para incluir scope
  - Obtener scope del rol durante el login
  - Incluir role_scope en JWT metadata
  - Actualizar función sin romper funcionalidad existente
  - _Requirements: 5.1, 5.2_

- [ ] 3.2 Actualizar optimized-auth.js para manejar scope
  - Agregar scope a userContext derivado
  - Modificar getRoleInfo para incluir información de scope
  - Mantener compatibilidad con roles existentes
  - _Requirements: 9.2_

- [ ]* 3.3 Escribir test de propiedad para JWT con scope
  - **Property 19: Own-scope data isolation**
  - **Validates: Requirements 5.1**

- [ ] 4. Checkpoint - Verificar base de datos y autenticación
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Actualizar consultas locales para filtrado por usuario
  - Modificar servicios de datos existentes para considerar scope del rol
  - Implementar filtrado por created_by cuando el rol tiene scope 'own'
  - Mantener funcionalidad completa para roles con scope 'tenant'
  - _Requirements: 5.1, 5.2, 9.3, 9.4_

- [ ] 5.1 Modificar servicio de productos para scope-based filtering
  - Actualizar getProductos() para filtrar por created_by según scope
  - Modificar createProducto() para incluir created_by automáticamente
  - Mantener compatibilidad con código existente
  - _Requirements: 5.1, 9.3_

- [ ] 5.2 Modificar servicio de clientes para scope-based filtering
  - Actualizar consultas de clientes para respetar scope del rol
  - Implementar filtrado por created_by para usuarios con scope 'own'
  - Permitir acceso completo para usuarios con scope 'tenant'
  - _Requirements: 5.1, 9.3, 9.4_

- [ ]* 5.3 Escribir test de propiedad para filtrado local por scope
  - **Property 20: Tenant-scope data access**
  - **Validates: Requirements 5.2**

- [ ] 5.4 Actualizar sincronización para respetar scope
  - Modificar syncProductosToSupabase para considerar scope del usuario
  - Asegurar que usuarios con scope 'own' solo sincronicen sus datos
  - Permitir sincronización completa para usuarios con scope 'tenant'
  - _Requirements: 5.1, 5.2_

- [ ]* 5.5 Escribir test de propiedad para sincronización con scope
  - **Property 14: Sync tenant isolation**
  - **Validates: Requirements 3.5**

- [ ] 6. Crear utilidades para manejo de roles genéricos
  - Implementar funciones helper para trabajar con roles genéricos
  - Crear mapeo entre roles específicos y genéricos
  - Implementar validación de permisos basada en scope
  - _Requirements: 9.1, 9.2, 5.3_

- [ ] 6.1 Crear helper functions para roles genéricos
  - Implementar función para obtener scope de un rol
  - Crear función para mapear roles específicos a genéricos
  - Implementar validación de permisos considerando scope
  - _Requirements: 9.1, 9.2_

- [ ] 6.2 Actualizar componentes UI para mostrar información de scope
  - Modificar UserHeader para mostrar scope del rol actual
  - Actualizar indicadores de permisos en la interfaz
  - Mantener compatibilidad visual con roles existentes
  - _Requirements: 5.1, 5.2_

- [ ]* 6.3 Escribir test de propiedad para helper functions
  - **Property 36: Insufficient permission denial with logging**
  - **Validates: Requirements 9.5**

- [ ] 6.4 Crear sistema de logging para accesos denegados
  - Implementar logging cuando se deniega acceso por scope
  - Crear audit trail para intentos de acceso no autorizado
  - Integrar con sistema de logging existente
  - _Requirements: 5.3, 9.5_

- [ ]* 6.5 Escribir test de propiedad para audit logging
  - **Property 21: Authorization enforcement with audit**
  - **Validates: Requirements 5.3, 8.5**

- [ ] 7. Actualizar formularios existentes para scope-aware behavior
  - Modificar formularios existentes para considerar scope del usuario
  - Implementar validación de permisos antes de mostrar/ocultar campos
  - Asegurar que created_by se incluya automáticamente
  - _Requirements: 8.1, 8.2, 5.1, 5.2_

- [ ] 7.1 Actualizar formulario de productos para scope
  - Modificar src/routes/productos/+page.svelte para considerar scope
  - Mostrar solo productos propios si scope = 'own'
  - Permitir ver todos los productos si scope = 'tenant'
  - _Requirements: 5.1, 5.2, 8.2_

- [ ] 7.2 Actualizar formulario de clientes para scope
  - Modificar formularios de clientes para respetar scope del rol
  - Implementar filtrado automático basado en created_by
  - Mantener funcionalidad completa para roles administrativos
  - _Requirements: 5.1, 5.2, 8.2_

- [ ]* 7.3 Escribir test de propiedad para formularios scope-aware
  - **Property 23: Data creator tagging**
  - **Validates: Requirements 5.5**

- [ ] 7.4 Crear componente genérico para filtrado por scope
  - Implementar componente reutilizable que aplique filtrado automático
  - Crear wrapper que considere scope del usuario actual
  - Facilitar aplicación consistente en toda la aplicación
  - _Requirements: 8.2, 5.1, 5.2_

- [ ]* 7.5 Escribir test de propiedad para componente de filtrado
  - **Property 11: Comprehensive tenant data isolation**
  - **Validates: Requirements 3.1, 3.3, 8.2**

- [ ] 8. Checkpoint - Verificar implementación de scope-based access
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Crear herramientas de migración y compatibilidad
  - Implementar scripts para migrar datos existentes al nuevo sistema
  - Crear herramientas para mapear roles específicos a genéricos
  - Asegurar compatibilidad hacia atrás con código existente
  - _Requirements: 9.1, 9.2_

- [ ] 9.1 Crear script de migración de roles
  - Implementar script para agregar scope a roles existentes
  - Mapear roles específicos (cobrador) a roles genéricos (user)
  - Mantener roles existentes para compatibilidad
  - _Requirements: 9.1, 9.2_

- [ ] 9.2 Crear herramientas de testing para scope
  - Implementar utilidades para probar diferentes combinaciones de scope
  - Crear datos de prueba con diferentes usuarios y scopes
  - Facilitar testing manual del sistema de roles
  - _Requirements: 5.1, 5.2, 9.3, 9.4_

- [ ]* 9.3 Escribir test de propiedad para migración
  - **Property 22: Permission update propagation**
  - **Validates: Requirements 5.4**

- [ ] 10. Documentación y testing integral del sistema de scope
  - Crear documentación para el nuevo sistema de roles genéricos
  - Implementar tests de integración para scope-based access
  - Crear guía de migración para desarrolladores
  - _Requirements: 9.1, 9.2, 5.1, 5.2_

- [ ] 10.1 Crear documentación del sistema de roles genéricos
  - Documentar los 4 roles genéricos y sus scopes
  - Crear ejemplos de uso para cada tipo de rol
  - Explicar diferencias entre scope 'own' y 'tenant'
  - _Requirements: 9.1, 9.2_

- [ ] 10.2 Implementar tests de integración end-to-end
  - Crear tests que verifiquen aislamiento de datos por usuario
  - Probar escenarios con múltiples usuarios del mismo tenant
  - Validar que roles con scope 'own' solo ven sus datos
  - _Requirements: 5.1, 5.2, 9.3, 9.4_

- [ ]* 10.3 Escribir test de propiedad para sistema completo
  - **Property 12: Automatic data context tagging**
  - **Validates: Requirements 3.2, 8.1**

- [ ] 10.4 Crear guía de troubleshooting para scope issues
  - Documentar problemas comunes con scope-based access
  - Crear herramientas de diagnóstico para problemas de permisos
  - Explicar cómo debuggear issues de filtrado por usuario
  - _Requirements: 5.3, 9.5_

- [ ] 11. Final Checkpoint - Sistema de roles genéricos completo
  - Ensure all tests pass, ask the user if questions arise.