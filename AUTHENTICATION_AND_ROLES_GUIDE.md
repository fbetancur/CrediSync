# Guía Completa: Sistema de Autenticación y Roles Multi-Tenant

## Tabla de Contenidos
1. [Arquitectura General](#arquitectura-general)
2. [Estructura de Base de Datos](#estructura-de-base-de-datos)
3. [Sistema de Roles y Scopes](#sistema-de-roles-y-scopes)
4. [Implementación de Autenticación](#implementación-de-autenticación)
5. [Filtros de Seguridad](#filtros-de-seguridad)
6. [Configuración de Nuevo Tenant](#configuración-de-nuevo-tenant)
7. [Sincronización Offline-First](#sincronización-offline-first)
8. [Troubleshooting](#troubleshooting)

---

## Arquitectura General

### Principios de Diseño
- **Multi-tenant**: Múltiples empresas en la misma aplicación
- **Offline-first**: Datos locales en IndexedDB con sincronización
- **Scope-based security**: Separación por alcance de datos (own vs tenant)
- **Generic roles**: Roles reutilizables entre diferentes tipos de negocio

### Flujo de Autenticación
```
1. Usuario ingresa credenciales
2. Supabase Auth valida credenciales
3. Se carga información multi-tenant (usuario, tenant, rol)
4. Se aplican filtros de seguridad según scope del rol
5. Se inicia sincronización automática de datos
6. Usuario accede a datos filtrados según su rol y scope
```

---

## Estructura de Base de Datos

### Tabla: `tenants`
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `roles`
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    nombre VARCHAR(50) NOT NULL, -- 'admin', 'manager', 'user', 'viewer'
    scope VARCHAR(20) NOT NULL,  -- 'own' o 'tenant'
    descripcion TEXT,
    es_admin BOOLEAN DEFAULT false,
    permisos JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, nombre)
);
```

### Tabla: `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY, -- Mismo ID que Supabase Auth
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (tenant_id, rol) REFERENCES roles(tenant_id, nombre)
);
```

### Row Level Security (RLS)
```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política para usuarios: solo ven datos de su tenant
CREATE POLICY "Users can only see their tenant data" ON users
    FOR ALL USING (tenant_id = (
        SELECT tenant_id FROM users WHERE id = auth.uid()
    ));

-- Política para roles: solo ven roles de su tenant
CREATE POLICY "Users can only see their tenant roles" ON roles
    FOR ALL USING (tenant_id = (
        SELECT tenant_id FROM users WHERE id = auth.uid()
    ));
```

---

## Sistema de Roles y Scopes

### Roles Genéricos

#### 1. **admin** (scope: tenant)
- **Descripción**: Administrador del tenant
- **Acceso**: Ve y gestiona todos los datos del tenant
- **Permisos**: Crear/editar/eliminar usuarios, ver todos los datos
- **Casos de uso**: Dueño de la empresa, gerente general

#### 2. **manager** (scope: tenant)
- **Descripción**: Gerente con acceso completo a datos del tenant
- **Acceso**: Ve todos los datos del tenant, puede gestionar usuarios
- **Permisos**: Ver todos los datos, gestionar usuarios no-admin
- **Casos de uso**: Supervisor, coordinador, gerente de área

#### 3. **user** (scope: own)
- **Descripción**: Usuario estándar con acceso solo a sus datos
- **Acceso**: Solo ve y gestiona datos que él mismo creó
- **Permisos**: CRUD en sus propios registros
- **Casos de uso**: Cobrador, vendedor, empleado de campo

#### 4. **viewer** (scope: own)
- **Descripción**: Observador con acceso de solo lectura a sus datos
- **Acceso**: Solo lectura de datos que él mismo creó
- **Permisos**: Solo lectura
- **Casos de uso**: Auditor, consultor, usuario temporal

### Compatibilidad con Roles Antiguos
```javascript
// Mapeo de compatibilidad en el código
const roleMapping = {
    'cobrador': 'user',     // scope: own
    'supervisor': 'manager', // scope: tenant
    'superadmin': 'admin'   // scope: tenant
};
```

---

## Implementación de Autenticación

### 1. Store de Autenticación (`src/lib/stores/simple-auth.js`)

```javascript
import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/supabase.js';
import { syncProductosToSupabase } from '$lib/sync/productos.js';

// Stores principales
export const user = writable(null);                    // Usuario de Supabase Auth
export const tenantData = writable(null);              // Datos multi-tenant

// Stores derivados
export const currentUser = derived(tenantData, $tenantData => $tenantData?.user || null);
export const currentTenant = derived(tenantData, $tenantData => $tenantData?.tenant || null);
export const currentRole = derived(tenantData, $tenantData => $tenantData?.role || null);
export const isAdmin = derived(tenantData, $tenantData => $tenantData?.role?.es_admin || false);
```

### 2. Carga de Datos Multi-Tenant

```javascript
async function loadTenantData(userId) {
    try {
        // 1. Obtener datos del usuario
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, tenant_id, email, nombre, rol, activo')
            .eq('id', userId)
            .eq('activo', true)
            .single();

        // 2. Obtener datos del tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, nombre, activo')
            .eq('id', userData.tenant_id)
            .eq('activo', true)
            .single();

        // 3. Obtener información del rol
        const { data: roleData, error: roleError } = await supabase
            .from('roles')
            .select('id, nombre, permisos, es_admin, scope')
            .eq('tenant_id', userData.tenant_id)
            .eq('nombre', userData.rol)
            .single();

        // 4. Establecer datos en el store
        tenantData.set({
            user: {
                id: userData.id,
                email: userData.email,
                nombre: userData.nombre,
                rol: userData.rol,
                tenant_id: userData.tenant_id
            },
            tenant: {
                id: tenant.id,
                nombre: tenant.nombre
            },
            role: roleData || { nombre: userData.rol, permisos: {}, es_admin: false }
        });

        // 5. Iniciar sincronización automática
        await syncProductosToSupabase();

    } catch (error) {
        console.error('Error cargando datos multi-tenant:', error);
        await auth.signOut(); // Logout por seguridad
    }
}
```

---

## Filtros de Seguridad

### 1. Data Service (`src/lib/db/data-service.js`)

```javascript
class DataService {
    getCurrentUser() {
        const user = get(currentUser);
        const tenant = get(currentTenant);
        
        if (!user || !tenant) {
            throw new Error('Usuario no autenticado');
        }
        
        return {
            id: user.id,
            email: user.email,
            tenant_id: user.tenant_id,
            role: user.rol
        };
    }

    applySecurityFilters(table, tableName) {
        const currentUser = this.getCurrentUser();
        
        // Filtro obligatorio por tenant
        let filtered = table.where('tenant_id').equals(currentUser.tenant_id);
        
        // Filtros por scope del rol
        if (tableName === 'clientes' || tableName === 'creditos') {
            switch (currentUser.role) {
                case 'user':
                case 'viewer':
                case 'cobrador': // Compatibilidad
                    // Scope 'own': solo sus datos
                    return filtered.and(record => record.created_by === currentUser.id);
                    
                case 'manager':
                case 'admin':
                case 'supervisor': // Compatibilidad
                    // Scope 'tenant': todos los datos del tenant
                    return filtered;
                    
                default:
                    // Por defecto: solo sus datos
                    return filtered.and(record => record.created_by === currentUser.id);
            }
        }
        
        return filtered;
    }
}
```

### 2. Aplicación de Filtros

```javascript
// Ejemplo: Obtener clientes con filtros de seguridad
async getClientes() {
    try {
        const currentUser = this.getCurrentUser();
        console.log('Obteniendo clientes para tenant:', currentUser.tenant_id, 'rol:', currentUser.role);
        
        // Aplicar filtros automáticamente
        const filtered = this.applySecurityFilters(db.clientes, 'clientes');
        const clientes = await filtered.toArray();
        
        console.log('Clientes encontrados (con filtros):', clientes.length);
        return clientes;
    } catch (error) {
        console.error('Error en getClientes:', error);
        return [];
    }
}
```

---

## Configuración de Nuevo Tenant

### Script Completo para Nuevo Tenant

```sql
-- 1. Crear el tenant
INSERT INTO tenants (id, nombre, activo) VALUES
('NUEVO_TENANT_ID', 'Nombre de la Nueva Empresa', true);

-- 2. Crear los 4 roles genéricos
INSERT INTO roles (id, tenant_id, nombre, scope, descripcion, es_admin, permisos) VALUES
(gen_random_uuid(), 'NUEVO_TENANT_ID', 'admin', 'tenant', 'Administrador del tenant', true, '{}'),
(gen_random_uuid(), 'NUEVO_TENANT_ID', 'manager', 'tenant', 'Gerente - Acceso completo a datos del tenant', false, '{}'),
(gen_random_uuid(), 'NUEVO_TENANT_ID', 'user', 'own', 'Usuario - Acceso solo a sus propios datos', false, '{}'),
(gen_random_uuid(), 'NUEVO_TENANT_ID', 'viewer', 'own', 'Observador - Solo lectura de sus propios datos', false, '{}');

-- 3. Crear usuario administrador
INSERT INTO users (id, tenant_id, email, nombre, rol, activo) VALUES
('SUPABASE_AUTH_USER_ID', 'NUEVO_TENANT_ID', 'admin@nuevaempresa.com', 'Administrador', 'admin', true);

-- 4. Crear productos básicos
INSERT INTO productos_credito (id, tenant_id, nombre, interes_porcentaje, numero_cuotas, frecuencia, monto_minimo, monto_maximo, activo) VALUES
(gen_random_uuid(), 'NUEVO_TENANT_ID', 'Crédito Personal', 2.5, 12, 'semanal', 100000, 1000000, true),
(gen_random_uuid(), 'NUEVO_TENANT_ID', 'Microcrédito', 3.0, 8, 'semanal', 50000, 500000, true);
```

### Pasos Manuales

1. **Generar UUID para tenant**: Usar `gen_random_uuid()` o generador online
2. **Crear usuario en Supabase Auth**: Dashboard > Authentication > Users
3. **Copiar User ID**: Del usuario creado en Supabase Auth
4. **Ejecutar script**: Reemplazando los IDs correspondientes
5. **Probar login**: Verificar que todo funcione correctamente

---

## Sincronización Offline-First

### 1. Schema de IndexedDB (`src/lib/db/schema.js`)

```javascript
export class CrediSyncDB extends Dexie {
    constructor() {
        super('credisync_db');
        
        this.version(1).stores({
            // Datos principales
            productos_credito: '++id, tenant_id, created_by, nombre, activo, synced',
            clientes: '++id, tenant_id, created_by, nombre, synced',
            creditos: '++id, tenant_id, created_by, cliente_id, estado, synced',
            
            // Cola de sincronización
            sync_queue: '++id, table, operation, timestamp, synced, retry_count',
            
            // Cache de usuarios
            device_users: '++id, email, tenant_id, role, last_login'
        });
    }
}
```

### 2. Sincronización Automática

```javascript
// En simple-auth.js - se ejecuta al hacer login
async function loadTenantData(userId) {
    // ... carga de datos ...
    
    // Iniciar sincronización automática
    try {
        await syncProductosToSupabase();
        console.log('Sincronización inicial completada');
    } catch (syncError) {
        console.warn('Error en sincronización inicial:', syncError);
    }
}
```

### 3. Filtros en Sincronización

```javascript
// En sync/productos.js - usar tenant real del usuario
export async function syncProductosToSupabase() {
    const user = get(currentUser);
    const tenant = get(currentTenant);
    if (!user || !tenant) return;

    // Descargar solo datos del tenant del usuario
    const { data: remoteProductos, error } = await supabase
        .from('productos_credito')
        .select('*')
        .eq('tenant_id', user.tenant_id); // NO hardcodeado
        
    // ... resto de la lógica de sync ...
}
```

---

## Troubleshooting

### Problemas Comunes

#### 1. **Usuario ve datos de otros usuarios del mismo tenant**
**Causa**: Filtros de seguridad no aplicados correctamente
**Solución**: Verificar que `applySecurityFilters()` se esté usando en todas las consultas

#### 2. **Error "collection.where is not a function"**
**Causa**: Usar `db.table.toCollection()` en lugar de `db.table` directamente
**Solución**: Pasar `db.table` directamente a `applySecurityFilters()`

#### 3. **Rol no encontrado en base de datos**
**Causa**: Roles no creados para el tenant o nombre incorrecto
**Solución**: Verificar que existan los 4 roles genéricos para el tenant

#### 4. **Sincronización no funciona**
**Causa**: Tenant ID hardcodeado o usuario no autenticado
**Solución**: Usar `user.tenant_id` real, verificar autenticación

### Logs de Debug

```javascript
// Agregar estos logs para debugging
console.log('🔍 Usuario actual:', currentUser);
console.log('🏢 Tenant actual:', currentTenant);
console.log('👤 Rol actual:', currentRole);
console.log('🔒 Filtros aplicados para:', tableName, 'rol:', role);
```

### Verificación de Seguridad

```sql
-- Verificar que RLS esté habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true;

-- Verificar políticas RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';
```

---

## Checklist de Implementación

### ✅ Base de Datos
- [ ] Tablas `tenants`, `roles`, `users` creadas
- [ ] RLS habilitado en todas las tablas
- [ ] Políticas RLS configuradas
- [ ] Índices creados para performance

### ✅ Autenticación
- [ ] Store `simple-auth.js` implementado
- [ ] Carga de datos multi-tenant funcionando
- [ ] Sincronización automática al login
- [ ] Manejo de errores y logout por seguridad

### ✅ Filtros de Seguridad
- [ ] `DataService` con `applySecurityFilters()`
- [ ] Filtros aplicados en todas las consultas
- [ ] Scope-based filtering funcionando
- [ ] Compatibilidad con roles antiguos

### ✅ Sincronización
- [ ] IndexedDB schema actualizado
- [ ] Sync usando tenant real (no hardcodeado)
- [ ] Cola de sincronización implementada
- [ ] Manejo de errores de sync

### ✅ Testing
- [ ] Usuarios con scope 'own' solo ven sus datos
- [ ] Usuarios con scope 'tenant' ven todos los datos del tenant
- [ ] Separación entre tenants funciona
- [ ] Sincronización offline-first funciona

---

## Conclusión

Este sistema proporciona:
- **Seguridad robusta** con separación por tenant y scope
- **Flexibilidad** con roles genéricos reutilizables
- **Funcionalidad offline** con sincronización automática
- **Escalabilidad** para múltiples tenants y tipos de negocio

La implementación está diseñada para ser mantenible, segura y fácil de replicar en futuros proyectos.