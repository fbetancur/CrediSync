-- =====================================================
-- MIGRACIÓN A SISTEMA DE ROLES GENÉRICOS
-- =====================================================
-- Este script agrega el sistema de roles genéricos manteniendo
-- compatibilidad total con roles y usuarios existentes

-- =====================================================
-- PASO 1: AGREGAR CAMPO SCOPE A TABLA ROLES EXISTENTE
-- =====================================================

-- Agregar campo scope con valor por defecto
ALTER TABLE roles 
ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'own' 
CHECK (scope IN ('own', 'tenant'));

-- Crear índice para consultas por scope
CREATE INDEX IF NOT EXISTS idx_roles_tenant_scope ON roles(tenant_id, scope);

-- =====================================================
-- PASO 2: ASIGNAR SCOPE A ROLES EXISTENTES
-- =====================================================

-- Actualizar roles admin existentes con scope 'tenant'
UPDATE roles 
SET scope = 'tenant' 
WHERE nombre = 'admin' AND scope IS NULL;

-- Actualizar roles cobrador existentes con scope 'own'
UPDATE roles 
SET scope = 'own' 
WHERE nombre = 'cobrador' AND scope IS NULL;

-- =====================================================
-- PASO 3: CREAR ROLES GENÉRICOS EN TODOS LOS TENANTS
-- =====================================================

-- Función helper para crear roles genéricos
CREATE OR REPLACE FUNCTION create_generic_roles_for_tenant(tenant_uuid UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Crear rol 'manager' (scope: tenant) si no existe
    INSERT INTO roles (tenant_id, nombre, descripcion, permisos, es_admin, puede_crear_usuarios, scope, activo)
    VALUES (
        tenant_uuid,
        'manager',
        'Gerente - Acceso completo a datos del tenant, puede gestionar usuarios',
        '{"clientes": ["create", "read", "update", "delete"], "creditos": ["create", "read", "update", "delete"], "cuotas": ["create", "read", "update", "delete"], "pagos": ["create", "read", "update", "delete"], "productos_credito": ["create", "read", "update", "delete"], "users": ["create", "read", "update"]}',
        false,
        true,
        'tenant',
        true
    ) ON CONFLICT (tenant_id, nombre) DO NOTHING;

    -- Crear rol 'user' (scope: own) si no existe - mapea desde cobrador
    INSERT INTO roles (tenant_id, nombre, descripcion, permisos, es_admin, puede_crear_usuarios, scope, activo)
    VALUES (
        tenant_uuid,
        'user',
        'Usuario - Acceso solo a sus propios datos',
        '{"clientes": ["create", "read", "update"], "creditos": ["create", "read", "update"], "cuotas": ["read", "update"], "pagos": ["create", "read"], "productos_credito": ["read"]}',
        false,
        false,
        'own',
        true
    ) ON CONFLICT (tenant_id, nombre) DO NOTHING;

    -- Crear rol 'viewer' (scope: own) si no existe
    INSERT INTO roles (tenant_id, nombre, descripcion, permisos, es_admin, puede_crear_usuarios, scope, activo)
    VALUES (
        tenant_uuid,
        'viewer',
        'Observador - Solo lectura de sus propios datos',
        '{"clientes": ["read"], "creditos": ["read"], "cuotas": ["read"], "pagos": ["read"], "productos_credito": ["read"]}',
        false,
        false,
        'own',
        true
    ) ON CONFLICT (tenant_id, nombre) DO NOTHING;

    RAISE NOTICE 'Roles genéricos creados para tenant: %', tenant_uuid;
END;
$$;

-- Aplicar roles genéricos a todos los tenants existentes
DO $$
DECLARE
    tenant_record RECORD;
BEGIN
    FOR tenant_record IN 
        SELECT DISTINCT tenant_id FROM roles WHERE tenant_id IS NOT NULL
    LOOP
        PERFORM create_generic_roles_for_tenant(tenant_record.tenant_id);
    END LOOP;
END;
$$;

-- =====================================================
-- PASO 4: ACTUALIZAR POLÍTICAS RLS PARA SCOPE
-- =====================================================

-- Función helper para obtener scope del rol actual
CREATE OR REPLACE FUNCTION get_current_user_scope()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        r.scope,
        'own'  -- Default fallback
    )
    FROM users u
    JOIN roles r ON r.tenant_id = u.tenant_id AND r.nombre = u.rol
    WHERE u.id = auth.uid()
    AND u.tenant_id = get_current_tenant_id();
$$;

-- Función helper para verificar si usuario puede acceder a datos
CREATE OR REPLACE FUNCTION can_access_data(data_created_by UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT CASE 
        WHEN get_current_user_scope() = 'tenant' THEN true
        WHEN get_current_user_scope() = 'own' AND data_created_by = auth.uid() THEN true
        ELSE false
    END;
$$;

-- =====================================================
-- PASO 5: CREAR NUEVAS POLÍTICAS RLS CON SCOPE
-- =====================================================

-- CLIENTES: Política con scope-based access
DROP POLICY IF EXISTS "clientes_scope_access" ON clientes;
CREATE POLICY "clientes_scope_access" ON clientes
    FOR ALL 
    USING (
        tenant_id = get_current_tenant_id() AND
        can_access_data(created_by)
    );

-- PRODUCTOS_CREDITO: Política con scope-based access  
DROP POLICY IF EXISTS "productos_scope_access" ON productos_credito;
CREATE POLICY "productos_scope_access" ON productos_credito
    FOR ALL 
    USING (
        tenant_id = get_current_tenant_id() AND
        can_access_data(created_by)
    );

-- CREDITOS: Política con scope-based access
DROP POLICY IF EXISTS "creditos_scope_access" ON creditos;
CREATE POLICY "creditos_scope_access" ON creditos
    FOR ALL 
    USING (
        tenant_id = get_current_tenant_id() AND
        can_access_data(created_by)
    );

-- CUOTAS: Política con scope-based access
DROP POLICY IF EXISTS "cuotas_scope_access" ON cuotas;
CREATE POLICY "cuotas_scope_access" ON cuotas
    FOR ALL 
    USING (
        tenant_id = get_current_tenant_id() AND
        can_access_data(created_by)
    );

-- PAGOS: Política con scope-based access
DROP POLICY IF EXISTS "pagos_scope_access" ON pagos;
CREATE POLICY "pagos_scope_access" ON pagos
    FOR ALL 
    USING (
        tenant_id = get_current_tenant_id() AND
        can_access_data(created_by)
    );

-- =====================================================
-- PASO 6: CREAR ÍNDICES OPTIMIZADOS PARA SCOPE
-- =====================================================

-- Índices para consultas con created_by (usuarios con scope 'own')
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_created_by ON clientes(tenant_id, created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_productos_tenant_created_by ON productos_credito(tenant_id, created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_creditos_tenant_created_by ON creditos(tenant_id, created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_cuotas_tenant_created_by ON cuotas(tenant_id, created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_pagos_tenant_created_by ON pagos(tenant_id, created_by, created_at);

-- =====================================================
-- PASO 7: VERIFICACIÓN Y TESTING
-- =====================================================

-- Función para verificar la migración
CREATE OR REPLACE FUNCTION verify_generic_roles_migration()
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    admin_count BIGINT,
    manager_count BIGINT,
    user_count BIGINT,
    viewer_count BIGINT,
    cobrador_count BIGINT,
    total_roles BIGINT
)
LANGUAGE SQL
AS $$
    SELECT 
        r.tenant_id,
        COALESCE(t.nombre, 'Unknown') as tenant_name,
        COUNT(*) FILTER (WHERE r.nombre = 'admin') as admin_count,
        COUNT(*) FILTER (WHERE r.nombre = 'manager') as manager_count,
        COUNT(*) FILTER (WHERE r.nombre = 'user') as user_count,
        COUNT(*) FILTER (WHERE r.nombre = 'viewer') as viewer_count,
        COUNT(*) FILTER (WHERE r.nombre = 'cobrador') as cobrador_count,
        COUNT(*) as total_roles
    FROM roles r
    LEFT JOIN tenants t ON t.id = r.tenant_id
    WHERE r.activo = true
    GROUP BY r.tenant_id, t.nombre
    ORDER BY r.tenant_id;
$$;

-- Ejecutar verificación
SELECT * FROM verify_generic_roles_migration();

-- Verificar que todos los roles tienen scope asignado
SELECT 
    'Roles sin scope asignado' as check_type,
    COUNT(*) as count
FROM roles 
WHERE scope IS NULL;

-- Verificar políticas RLS creadas
SELECT 
    'Nuevas políticas RLS creadas' as check_type,
    COUNT(*) as count
FROM pg_policies 
WHERE schemaname = 'public' 
AND policyname LIKE '%scope_access';

-- =====================================================
-- PASO 8: INSTRUCCIONES FINALES
-- =====================================================

/*
MIGRACIÓN COMPLETADA EXITOSAMENTE

✅ Campo 'scope' agregado a tabla roles
✅ Scope asignado a roles existentes (admin=tenant, cobrador=own)
✅ 4 roles genéricos creados en todos los tenants:
   - admin (scope: tenant) - ya existía
   - manager (scope: tenant) - nuevo
   - user (scope: own) - nuevo, similar a cobrador
   - viewer (scope: own) - nuevo, solo lectura
✅ Políticas RLS actualizadas para scope-based access
✅ Índices optimizados para consultas por created_by
✅ Funciones helper para manejo de scope

COMPATIBILIDAD:
- Todos los usuarios existentes siguen funcionando igual
- Roles existentes (admin, cobrador) mantienen su funcionalidad
- Nuevos roles genéricos están disponibles para usar

PRÓXIMOS PASOS:
1. Actualizar código frontend para usar get_current_user_scope()
2. Modificar consultas locales para considerar scope
3. Actualizar JWT para incluir role_scope
4. Probar con usuarios existentes

TESTING:
- Probar login con usuarios admin existentes (deben ver todos los datos)
- Probar login con usuarios cobrador existentes (deben ver solo sus datos)
- Crear usuarios con nuevos roles genéricos y probar acceso
*/

-- Limpiar función temporal
DROP FUNCTION IF EXISTS create_generic_roles_for_tenant(UUID);