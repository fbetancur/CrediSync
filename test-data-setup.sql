-- =====================================================
-- CREAR DATOS DE PRUEBA PARA SISTEMA MULTI-TENANT
-- =====================================================

-- 1. CREAR TENANT DE PRUEBA
INSERT INTO tenants (id, nombre, usuarios_contratados, usuarios_activos, activo)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'CrediSync Demo',
    5,
    1,
    true
) ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    usuarios_contratados = EXCLUDED.usuarios_contratados,
    activo = EXCLUDED.activo;

-- 2. CREAR ROLES PARA EL TENANT
INSERT INTO roles (tenant_id, nombre, descripcion, permisos, es_admin, puede_crear_usuarios)
VALUES 
    (
        '11111111-1111-1111-1111-111111111111',
        'admin',
        'Administrador completo del tenant',
        '{"all": true}',
        true,
        true
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        'cobrador',
        'Cobrador de campo',
        '{"clientes": ["read"], "creditos": ["read"], "cuotas": ["read", "update"], "pagos": ["create", "read"]}',
        false,
        false
    )
ON CONFLICT (tenant_id, nombre) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    permisos = EXCLUDED.permisos,
    es_admin = EXCLUDED.es_admin,
    puede_crear_usuarios = EXCLUDED.puede_crear_usuarios;

-- 3. VERIFICAR QUE TENEMOS LOS ROLES CREADOS
SELECT 
    'Roles creados:' as info,
    r.nombre,
    r.descripcion,
    r.es_admin
FROM roles r
WHERE r.tenant_id = '11111111-1111-1111-1111-111111111111';

-- =====================================================
-- INSTRUCCIONES PARA CREAR USUARIO EN SUPABASE AUTH
-- =====================================================

/*
IMPORTANTE: Los siguientes pasos debes hacerlos en el Dashboard de Supabase:

1. Ve a Authentication → Users
2. Haz clic en "Add user"
3. Usa estos datos:
   - Email: admin@credisync.demo
   - Password: CrediSync2024!
   - Confirm password: CrediSync2024!
4. Haz clic en "Add user"

Después de crear el usuario en Supabase Auth, ejecuta el siguiente SQL:
*/

-- 4. INSERTAR USUARIO EN NUESTRA TABLA (ejecutar DESPUÉS de crear en Supabase Auth)
-- NOTA: Reemplaza 'USER_UUID_FROM_SUPABASE' con el UUID real del usuario creado

/*
INSERT INTO users (id, tenant_id, email, nombre, rol, activo)
VALUES (
    'USER_UUID_FROM_SUPABASE', -- Reemplazar con UUID real
    '11111111-1111-1111-1111-111111111111',
    'admin@credisync.demo',
    'Administrador Demo',
    'admin',
    true
);
*/

-- 5. CREAR ALGUNOS DATOS DE PRUEBA PARA EL TENANT

-- Productos de crédito
INSERT INTO productos_credito (tenant_id, nombre, descripcion, interes_porcentaje, plazo_minimo, plazo_maximo, monto_minimo, monto_maximo, activo)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Crédito Express',
    'Crédito rápido para emergencias',
    15.0,
    1,
    12,
    50000,
    500000,
    true
) ON CONFLICT DO NOTHING;

-- Ruta de cobranza
INSERT INTO rutas (tenant_id, nombre, descripcion, activa)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Ruta Centro',
    'Zona centro de la ciudad',
    true
) ON CONFLICT DO NOTHING;

-- Cliente de prueba
INSERT INTO clientes (
    tenant_id, 
    nombre, 
    numero_documento, 
    tipo_documento, 
    telefono, 
    direccion, 
    estado
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Juan Pérez Demo',
    '12345678',
    'CC',
    '3001234567',
    'Calle 123 #45-67',
    'activo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Verificar tenant
SELECT 'Tenant creado:' as info, nombre, usuarios_contratados, activo 
FROM tenants 
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Verificar roles
SELECT 'Roles creados:' as info, nombre, es_admin 
FROM roles 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

-- Verificar datos de prueba
SELECT 'Productos:' as info, COUNT(*) as cantidad 
FROM productos_credito 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

SELECT 'Clientes:' as info, COUNT(*) as cantidad 
FROM clientes 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

SELECT 'Rutas:' as info, COUNT(*) as cantidad 
FROM rutas 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

-- =====================================================
-- PRÓXIMOS PASOS
-- =====================================================

/*
Después de ejecutar este script:

1. Crear usuario en Supabase Auth Dashboard:
   - Email: admin@credisync.demo
   - Password: CrediSync2024!

2. Obtener el UUID del usuario creado y ejecutar:
   INSERT INTO users (id, tenant_id, email, nombre, rol, activo)
   VALUES ('UUID_AQUI', '11111111-1111-1111-1111-111111111111', 'admin@credisync.demo', 'Administrador Demo', 'admin', true);

3. Probar login en la aplicación con:
   - Email: admin@credisync.demo
   - Password: CrediSync2024!

4. Verificar que:
   - Login funciona sin selector de empresa
   - Se detecta automáticamente el tenant "CrediSync Demo"
   - Se asigna el rol "admin"
   - RLS filtra datos correctamente
*/