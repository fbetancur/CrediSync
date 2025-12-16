-- =====================================================
-- PASO 1: VERIFICAR Y COMPLETAR MULTI-TENANT DATABASE
-- =====================================================

-- 1. VERIFICAR POLÍTICAS RLS EXISTENTES
-- Ejecuta esto para ver qué políticas ya tienes:
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2. CREAR TABLA DE ROLES (si no existe)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    permisos JSONB DEFAULT '{}',
    es_admin BOOLEAN DEFAULT false,
    puede_crear_usuarios BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Constraint para evitar roles duplicados por tenant
    UNIQUE(tenant_id, nombre)
);

-- 3. HABILITAR RLS EN TODAS LAS TABLAS (si no está habilitado)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 4. CREAR FUNCIÓN HELPER PARA OBTENER TENANT_ID DEL JWT (en schema public)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        (auth.jwt() ->> 'tenant_id')::UUID,
        (SELECT tenant_id FROM users WHERE id = auth.uid())
    );
$$;

-- 5. POLÍTICAS RLS PARA AISLAMIENTO TOTAL POR TENANT

-- TENANTS: Solo admins pueden ver otros tenants
DROP POLICY IF EXISTS "tenant_isolation" ON tenants;
CREATE POLICY "tenant_isolation" ON tenants
    FOR ALL 
    USING (
        id = get_current_tenant_id() OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND rol = 'super_admin'
        )
    );

-- USERS: Solo usuarios del mismo tenant
DROP POLICY IF EXISTS "users_tenant_isolation" ON users;
CREATE POLICY "users_tenant_isolation" ON users
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- ROLES: Solo roles del mismo tenant
DROP POLICY IF EXISTS "roles_tenant_isolation" ON roles;
CREATE POLICY "roles_tenant_isolation" ON roles
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- CLIENTES: Solo clientes del mismo tenant
DROP POLICY IF EXISTS "clientes_tenant_isolation" ON clientes;
CREATE POLICY "clientes_tenant_isolation" ON clientes
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- CREDITOS: Solo créditos del mismo tenant
DROP POLICY IF EXISTS "creditos_tenant_isolation" ON creditos;
CREATE POLICY "creditos_tenant_isolation" ON creditos
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- CUOTAS: Solo cuotas del mismo tenant
DROP POLICY IF EXISTS "cuotas_tenant_isolation" ON cuotas;
CREATE POLICY "cuotas_tenant_isolation" ON cuotas
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- PAGOS: Solo pagos del mismo tenant
DROP POLICY IF EXISTS "pagos_tenant_isolation" ON pagos;
CREATE POLICY "pagos_tenant_isolation" ON pagos
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- PRODUCTOS_CREDITO: Solo productos del mismo tenant
DROP POLICY IF EXISTS "productos_tenant_isolation" ON productos_credito;
CREATE POLICY "productos_tenant_isolation" ON productos_credito
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- RUTAS: Solo rutas del mismo tenant
DROP POLICY IF EXISTS "rutas_tenant_isolation" ON rutas;
CREATE POLICY "rutas_tenant_isolation" ON rutas
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- SYNC_QUEUE: Solo queue del mismo tenant
DROP POLICY IF EXISTS "sync_queue_tenant_isolation" ON sync_queue;
CREATE POLICY "sync_queue_tenant_isolation" ON sync_queue
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- CHANGE_LOG: Solo cambios del mismo tenant
DROP POLICY IF EXISTS "change_log_tenant_isolation" ON change_log;
CREATE POLICY "change_log_tenant_isolation" ON change_log
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- AUDIT_LOG: Solo auditoría del mismo tenant
DROP POLICY IF EXISTS "audit_log_tenant_isolation" ON audit_log;
CREATE POLICY "audit_log_tenant_isolation" ON audit_log
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- APP_STATE: Solo estado del mismo tenant
DROP POLICY IF EXISTS "app_state_tenant_isolation" ON app_state;
CREATE POLICY "app_state_tenant_isolation" ON app_state
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- 6. ÍNDICES OPTIMIZADOS PARA CONSULTAS MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_id ON clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_created ON clientes(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_creditos_tenant_id ON creditos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_creditos_tenant_cliente ON creditos(tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_tenant_id ON cuotas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_tenant_id ON pagos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_tenant_fecha ON pagos(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_productos_tenant_id ON productos_credito(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rutas_tenant_id ON rutas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_tenant_id ON sync_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_tenant_synced ON sync_queue(tenant_id, synced);
CREATE INDEX IF NOT EXISTS idx_change_log_tenant_id ON change_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_state_tenant_device ON app_state(tenant_id, device_id);

-- 7. INSERTAR ROLES BÁSICOS PARA CADA TENANT EXISTENTE
INSERT INTO roles (tenant_id, nombre, descripcion, permisos, es_admin, puede_crear_usuarios)
SELECT 
    t.id as tenant_id,
    'admin' as nombre,
    'Administrador del tenant' as descripcion,
    '{"all": true}' as permisos,
    true as es_admin,
    true as puede_crear_usuarios
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM roles r 
    WHERE r.tenant_id = t.id AND r.nombre = 'admin'
);

INSERT INTO roles (tenant_id, nombre, descripcion, permisos, es_admin, puede_crear_usuarios)
SELECT 
    t.id as tenant_id,
    'cobrador' as nombre,
    'Cobrador de campo' as descripcion,
    '{"clientes": ["read"], "creditos": ["read"], "cuotas": ["read", "update"], "pagos": ["create", "read"]}' as permisos,
    false as es_admin,
    false as puede_crear_usuarios
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM roles r 
    WHERE r.tenant_id = t.id AND r.nombre = 'cobrador'
);

-- 8. FUNCIÓN PARA VERIFICAR PERMISOS
CREATE OR REPLACE FUNCTION check_permission(
    user_role TEXT,
    resource TEXT,
    action TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    role_permissions JSONB;
    resource_permissions JSONB;
BEGIN
    -- Obtener permisos del rol
    SELECT permisos INTO role_permissions
    FROM roles r
    JOIN users u ON u.tenant_id = r.tenant_id
    WHERE u.id = auth.uid() 
    AND r.nombre = user_role
    AND u.tenant_id = get_current_tenant_id();
    
    -- Si no se encuentra el rol, denegar acceso
    IF role_permissions IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Si tiene permisos de admin total
    IF role_permissions ->> 'all' = 'true' THEN
        RETURN TRUE;
    END IF;
    
    -- Verificar permisos específicos del recurso
    resource_permissions := role_permissions -> resource;
    
    IF resource_permissions IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Verificar si la acción está permitida
    RETURN resource_permissions ? action;
END;
$$;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Ejecuta esto para verificar que todo esté configurado:
SELECT 
    'Tablas con RLS habilitado' as check_type,
    COUNT(*) as count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relkind = 'r' 
AND c.relrowsecurity = true;

SELECT 
    'Políticas RLS creadas' as check_type,
    COUNT(*) as count
FROM pg_policies 
WHERE schemaname = 'public';

SELECT 
    'Índices creados' as check_type,
    COUNT(*) as count
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%tenant%';