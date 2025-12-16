# 📚 Documentación Completa - Supabase Multi-Tenant CrediSync

## 📋 Índice
1. [Resumen del Sistema](#resumen-del-sistema)
2. [Estructura de Base de Datos](#estructura-de-base-de-datos)
3. [Políticas RLS (Row Level Security)](#políticas-rls-row-level-security)
4. [Funciones de Base de Datos](#funciones-de-base-de-datos)
5. [Índices Optimizados](#índices-optimizados)
6. [Configuración de Autenticación](#configuración-de-autenticación)
7. [Scripts de Instalación](#scripts-de-instalación)
8. [Guía de Replicación](#guía-de-replicación)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Resumen del Sistema

### Arquitectura Multi-Tenant
- **Patrón**: Shared Database, Shared Schema con Row Level Security (RLS)
- **Aislamiento**: Automático por `tenant_id` en todas las tablas
- **Autenticación**: Supabase Auth con JWT que incluye `tenant_id`
- **Permisos**: Sistema de roles granular por tenant
- **Offline**: Sincronización bidireccional con queue de operaciones

### Características Principales
- ✅ **Aislamiento total** de datos por tenant
- ✅ **Autenticación sin selector** de empresa
- ✅ **Roles y permisos** granulares
- ✅ **Auditoría completa** de cambios
- ✅ **Sincronización offline** robusta
- ✅ **Optimización** para consultas multi-tenant

---

## 🗄️ Estructura de Base de Datos

### 1. Tabla `tenants` (Empresas/Organizaciones)

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    usuarios_contratados INTEGER NOT NULL DEFAULT 1,
    usuarios_activos INTEGER NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

**Propósito**: Almacena información de las empresas clientes
**Campos clave**:
- `usuarios_contratados`: Límite de usuarios por licencia
- `usuarios_activos`: Contador de usuarios activos
- `activo`: Control de acceso por expiración/suspensión

### 2. Tabla `roles` (Roles y Permisos)

```sql
CREATE TABLE roles (
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
    
    UNIQUE(tenant_id, nombre)
);
```

**Propósito**: Define roles y permisos específicos por tenant
**Estructura de permisos JSONB**:
```json
{
  "clientes": ["create", "read", "update", "delete"],
  "creditos": ["read", "update"],
  "pagos": ["create", "read"],
  "all": true  // Para admin completo
}
```

### 3. Tabla `users` (Usuarios del Sistema)

```sql
CREATE TABLE users (
    id UUID NOT NULL,  -- Referencia a auth.users
    tenant_id UUID NOT NULL,
    email TEXT NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    supervisor_id UUID REFERENCES users(id)
);
```

**Propósito**: Extiende auth.users con información multi-tenant
**Relaciones**:
- `id` → `auth.users.id` (1:1)
- `tenant_id` → `tenants.id` (N:1)
- `supervisor_id` → `users.id` (N:1, jerarquía)

### 4. Tablas de Negocio

#### 4.1 `clientes` (Clientes de Crédito)
```sql
CREATE TABLE clientes (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    created_by UUID,
    nombre TEXT NOT NULL,
    numero_documento TEXT NOT NULL,
    tipo_documento TEXT NOT NULL,
    telefono TEXT NOT NULL,
    telefono_2 TEXT,
    direccion TEXT NOT NULL,
    barrio TEXT,
    referencia TEXT,
    ruta_id UUID,
    latitud NUMERIC,
    longitud NUMERIC,
    nombre_fiador TEXT,
    telefono_fiador TEXT,
    creditos_activos INTEGER NOT NULL DEFAULT 0,
    saldo_total NUMERIC NOT NULL DEFAULT 0,
    dias_atraso_max INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'activo',
    score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    coordenadas JSONB,
    pais CHARACTER VARYING,
    email CHARACTER VARYING,
    observaciones TEXT
);
```

#### 4.2 `productos_credito` (Productos Financieros)
```sql
CREATE TABLE productos_credito (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    interes_porcentaje NUMERIC NOT NULL,
    plazo_minimo INTEGER NOT NULL,
    plazo_maximo INTEGER NOT NULL,
    monto_minimo NUMERIC NOT NULL,
    monto_maximo NUMERIC NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID
);
```

#### 4.3 `creditos` (Créditos Otorgados)
```sql
CREATE TABLE creditos (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    cliente_id UUID NOT NULL,
    producto_id UUID NOT NULL,
    cobrador_id UUID,
    ruta_id UUID,
    monto_original NUMERIC NOT NULL,
    interes_porcentaje NUMERIC NOT NULL,
    total_a_pagar NUMERIC NOT NULL,
    numero_cuotas INTEGER NOT NULL,
    valor_cuota NUMERIC NOT NULL,
    frecuencia TEXT NOT NULL,
    fecha_desembolso TIMESTAMP WITH TIME ZONE NOT NULL,
    fecha_primera_cuota TIMESTAMP WITH TIME ZONE NOT NULL,
    fecha_ultima_cuota TIMESTAMP WITH TIME ZONE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activo',
    saldo_pendiente NUMERIC NOT NULL,
    cuotas_pagadas INTEGER NOT NULL DEFAULT 0,
    dias_atraso INTEGER NOT NULL DEFAULT 0,
    excluir_domingos BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

#### 4.4 `cuotas` (Cuotas de Créditos)
```sql
CREATE TABLE cuotas (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    credito_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    numero INTEGER NOT NULL,
    valor NUMERIC NOT NULL,
    fecha_programada TIMESTAMP WITH TIME ZONE NOT NULL,
    fecha_pago TIMESTAMP WITH TIME ZONE,
    monto_pagado NUMERIC NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID
);
```

#### 4.5 `pagos` (Pagos Realizados)
```sql
CREATE TABLE pagos (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    credito_id UUID NOT NULL,
    cliente_id UUID NOT NULL,
    cobrador_id UUID NOT NULL,
    monto NUMERIC NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE NOT NULL,
    latitud NUMERIC,
    longitud NUMERIC,
    observaciones TEXT,
    comprobante_foto_url TEXT,
    device_id TEXT,
    app_version TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID
);
```

#### 4.6 `rutas` (Rutas de Cobranza)
```sql
CREATE TABLE rutas (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID
);
```

### 5. Tablas de Sistema

#### 5.1 `sync_queue` (Cola de Sincronización)
```sql
CREATE TABLE sync_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    data JSONB,
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 10,
    last_attempt TIMESTAMP WITH TIME ZONE,
    next_retry TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    synced BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Propósito**: Maneja operaciones offline pendientes de sincronización

#### 5.2 `change_log` (Log de Cambios)
```sql
CREATE TABLE change_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    field_changes JSONB,
    event_timestamp BIGINT NOT NULL,
    device_id TEXT,
    user_id UUID,
    synced BOOLEAN DEFAULT false,
    checksum TEXT,
    version_vector JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Propósito**: Rastrea todos los cambios para sincronización y auditoría

#### 5.3 `audit_log` (Log de Auditoría)
```sql
CREATE TABLE audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    device_id TEXT,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    data JSONB,
    metadata JSONB,
    event_timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Propósito**: Auditoría de seguridad y eventos del sistema

#### 5.4 `app_state` (Estado de Aplicación)
```sql
CREATE TABLE app_state (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    device_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Propósito**: Almacena configuraciones y estado por dispositivo

---

## 🔒 Políticas RLS (Row Level Security)

### Función Helper Principal

```sql
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
```

### Políticas por Tabla

#### 1. Tenants
```sql
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
```

#### 2. Users
```sql
CREATE POLICY "users_tenant_isolation" ON users
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());
```

#### 3. Roles
```sql
CREATE POLICY "roles_tenant_isolation" ON roles
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());
```

#### 4. Tablas de Negocio (Patrón Común)
```sql
-- Clientes
CREATE POLICY "clientes_tenant_isolation" ON clientes
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Créditos
CREATE POLICY "creditos_tenant_isolation" ON creditos
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Cuotas
CREATE POLICY "cuotas_tenant_isolation" ON cuotas
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Pagos
CREATE POLICY "pagos_tenant_isolation" ON pagos
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Productos Crédito
CREATE POLICY "productos_tenant_isolation" ON productos_credito
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Rutas
CREATE POLICY "rutas_tenant_isolation" ON rutas
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());
```

#### 5. Tablas de Sistema
```sql
-- Sync Queue
CREATE POLICY "sync_queue_tenant_isolation" ON sync_queue
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Change Log
CREATE POLICY "change_log_tenant_isolation" ON change_log
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- Audit Log
CREATE POLICY "audit_log_tenant_isolation" ON audit_log
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());

-- App State
CREATE POLICY "app_state_tenant_isolation" ON app_state
    FOR ALL 
    USING (tenant_id = get_current_tenant_id());
```

---

## ⚙️ Funciones de Base de Datos

### 1. Función de Verificación de Permisos

```sql
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
```

### 2. Función para Actualizar Timestamps

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

### 3. Triggers para Updated_At

```sql
-- Aplicar a todas las tablas que tienen updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Repetir para todas las tablas con updated_at...
```

---

## 📊 Índices Optimizados

### Índices por Tenant (Críticos)

```sql
-- Users
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);

-- Roles
CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);

-- Clientes
CREATE INDEX idx_clientes_tenant_id ON clientes(tenant_id);
CREATE INDEX idx_clientes_tenant_created ON clientes(tenant_id, created_at);

-- Créditos
CREATE INDEX idx_creditos_tenant_id ON creditos(tenant_id);
CREATE INDEX idx_creditos_tenant_cliente ON creditos(tenant_id, cliente_id);

-- Cuotas
CREATE INDEX idx_cuotas_tenant_id ON cuotas(tenant_id);

-- Pagos
CREATE INDEX idx_pagos_tenant_id ON pagos(tenant_id);
CREATE INDEX idx_pagos_tenant_fecha ON pagos(tenant_id, fecha);

-- Productos
CREATE INDEX idx_productos_tenant_id ON productos_credito(tenant_id);

-- Rutas
CREATE INDEX idx_rutas_tenant_id ON rutas(tenant_id);

-- Sistema
CREATE INDEX idx_sync_queue_tenant_id ON sync_queue(tenant_id);
CREATE INDEX idx_sync_queue_tenant_synced ON sync_queue(tenant_id, synced);
CREATE INDEX idx_change_log_tenant_id ON change_log(tenant_id);
CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_app_state_tenant_device ON app_state(tenant_id, device_id);
```

---

## 🔐 Configuración de Autenticación

### 1. Configuración JWT Custom Claims

En el Dashboard de Supabase → Authentication → Settings → JWT Settings:

```json
{
  "aud": "authenticated",
  "exp": 1234567890,
  "sub": "user-uuid",
  "email": "user@example.com",
  "tenant_id": "tenant-uuid",
  "role_id": "role-uuid",
  "permissions": ["read", "write"]
}
```

### 2. Hook para Actualizar JWT

```sql
-- Función que se ejecuta después del login
CREATE OR REPLACE FUNCTION update_user_jwt_claims()
RETURNS TRIGGER AS $$
BEGIN
    -- Actualizar metadata del usuario en auth.users
    UPDATE auth.users 
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'role', NEW.rol
    )
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que se ejecuta al insertar/actualizar users
CREATE TRIGGER update_jwt_claims_trigger
    AFTER INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_user_jwt_claims();
```

---

## 🚀 Scripts de Instalación

### Script Completo de Instalación

```sql
-- =====================================================
-- INSTALACIÓN COMPLETA MULTI-TENANT CREDISYNC
-- =====================================================

-- 1. HABILITAR EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREAR TABLAS (ver sección anterior)
-- ... (todas las CREATE TABLE statements)

-- 3. HABILITAR RLS
-- ... (todos los ALTER TABLE ENABLE ROW LEVEL SECURITY)

-- 4. CREAR FUNCIONES
-- ... (todas las funciones)

-- 5. CREAR POLÍTICAS RLS
-- ... (todas las políticas)

-- 6. CREAR ÍNDICES
-- ... (todos los índices)

-- 7. INSERTAR DATOS INICIALES
-- Roles básicos para cada tenant existente
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

-- 8. VERIFICACIÓN
SELECT 'Instalación completada' as status;
```

---

## 📖 Guía de Replicación

### Pasos para Replicar en Nuevo Proyecto

#### 1. Crear Proyecto Supabase
1. Ir a [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Esperar a que se inicialice

#### 2. Configurar Base de Datos
1. Ir a SQL Editor
2. Ejecutar script completo de instalación
3. Verificar que no hay errores

#### 3. Configurar Autenticación
1. Authentication → Settings
2. Habilitar Email/Password
3. Configurar JWT Settings si es necesario

#### 4. Configurar Variables de Entorno
```env
PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

#### 5. Verificar Funcionamiento
```sql
-- Test de aislamiento por tenant
SELECT * FROM clientes; -- Debe estar vacío sin autenticación
```

### Migración de Datos

#### Script de Migración
```sql
-- Backup de datos existentes
pg_dump --data-only --table=tenants > tenants_backup.sql
pg_dump --data-only --table=users > users_backup.sql
-- ... para todas las tablas

-- Restaurar en nuevo proyecto
psql -h nuevo-host -d nueva-db -f tenants_backup.sql
```

---

## 🔧 Troubleshooting

### Problemas Comunes

#### 1. Error: "permission denied for schema auth"
**Solución**: No crear funciones en schema `auth`, usar `public`

#### 2. RLS bloquea todas las consultas
**Solución**: Verificar que JWT incluye `tenant_id`
```sql
SELECT auth.jwt() ->> 'tenant_id';
```

#### 3. Políticas no funcionan
**Solución**: Verificar que RLS está habilitado
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

#### 4. Consultas lentas
**Solución**: Verificar índices por tenant
```sql
EXPLAIN ANALYZE SELECT * FROM clientes WHERE tenant_id = 'uuid';
```

### Comandos de Diagnóstico

```sql
-- Ver todas las políticas
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Ver índices
SELECT * FROM pg_indexes WHERE schemaname = 'public';

-- Ver funciones
SELECT * FROM pg_proc WHERE pronamespace = (
    SELECT oid FROM pg_namespace WHERE nspname = 'public'
);

-- Test de aislamiento
SELECT 
    tablename,
    (SELECT COUNT(*) FROM information_schema.tables t WHERE t.table_name = tablename) as exists,
    (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = tablename) as policies
FROM (VALUES 
    ('tenants'), ('users'), ('clientes'), ('creditos')
) AS t(tablename);
```

---

## 📝 Notas Importantes

### Seguridad
- ✅ **Nunca deshabilitar RLS** en producción
- ✅ **Validar JWT** en todas las operaciones críticas
- ✅ **Auditar cambios** de permisos regularmente
- ✅ **Monitorear** intentos de acceso no autorizado

### Performance
- ✅ **Usar índices compuestos** con tenant_id siempre primero
- ✅ **Limitar resultados** en consultas grandes
- ✅ **Cachear** datos de roles y permisos
- ✅ **Monitorear** queries lentas

### Mantenimiento
- ✅ **Backup regular** de datos y esquema
- ✅ **Actualizar** estadísticas de tablas
- ✅ **Limpiar** logs antiguos periódicamente
- ✅ **Verificar** integridad de datos

---

## 📞 Soporte

Para problemas específicos:
1. Verificar logs de Supabase
2. Revisar políticas RLS
3. Validar estructura de JWT
4. Consultar documentación oficial de Supabase

---

**Fecha de creación**: Diciembre 2024  
**Versión**: 1.0  
**Autor**: Sistema CrediSync Multi-Tenant