-- =====================================================
-- CREAR USUARIO DE PRUEBA Y DATOS PARA TESTING
-- =====================================================

-- PASO 1: Crear usuario en Supabase Auth Dashboard PRIMERO
-- Email: user.test@inversionespaisa.com
-- Password: CrediSync2024!
-- Después obtén el UUID y reemplázalo abajo

-- PASO 2: Insertar usuario en nuestra tabla
-- REEMPLAZA 'UUID_DEL_USUARIO_AQUI' con el UUID real de Supabase Auth
INSERT INTO users (id, tenant_id, email, nombre, rol, activo)
VALUES (
    'UUID_DEL_USUARIO_AQUI', -- ⚠️ REEMPLAZAR CON UUID REAL
    '11111111-1111-1111-1111-111111111111', -- Inversiones Paisa
    'user.test@inversionespaisa.com',
    'Usuario Prueba Visual',
    'user', -- Rol con scope 'own'
    true
);

-- PASO 3: Crear algunos datos de prueba para testing
-- Datos creados por el admin existente (debería verlos el admin, no el user)
INSERT INTO productos_credito (
    id,
    tenant_id, 
    nombre, 
    descripcion,
    interes_porcentaje,
    plazo_minimo,
    plazo_maximo,
    monto_minimo,
    monto_maximo,
    created_by,
    activo
) VALUES (
    uuid_generate_v4(),
    '11111111-1111-1111-1111-111111111111',
    'Producto Admin Test',
    'Producto creado por admin para testing',
    15.0,
    1,
    12,
    100000,
    1000000,
    'b9b9806a-eb97-4d4e-89e6-9ba7d388a6d5', -- Admin de Inversiones Paisa
    true
);

-- Datos creados por el nuevo usuario (solo él debería verlos)
INSERT INTO productos_credito (
    id,
    tenant_id, 
    nombre, 
    descripcion,
    interes_porcentaje,
    plazo_minimo,
    plazo_maximo,
    monto_minimo,
    monto_maximo,
    created_by,
    activo
) VALUES (
    uuid_generate_v4(),
    '11111111-1111-1111-1111-111111111111',
    'Producto User Test',
    'Producto creado por usuario test',
    12.0,
    1,
    6,
    50000,
    500000,
    'UUID_DEL_USUARIO_AQUI', -- ⚠️ REEMPLAZAR CON UUID REAL
    true
);

-- PASO 4: Verificar que los datos se insertaron correctamente
SELECT 
    'Productos por usuario' as info,
    created_by,
    COUNT(*) as cantidad,
    STRING_AGG(nombre, ', ') as productos
FROM productos_credito 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
GROUP BY created_by;

-- PASO 5: Verificar usuarios en el tenant
SELECT 
    'Usuarios en tenant' as info,
    u.nombre,
    u.email,
    u.rol,
    r.scope
FROM users u
JOIN roles r ON r.tenant_id = u.tenant_id AND r.nombre = u.rol
WHERE u.tenant_id = '11111111-1111-1111-1111-111111111111'
AND u.activo = true;

-- PASO 6: Testing manual - Instrucciones
/*
TESTING MANUAL:

1. Login como admin@inversionespaisa.com:
   - Debería ver AMBOS productos (Admin Test + User Test)
   - Scope = 'tenant' permite ver todos los datos

2. Login como user.test@inversionespaisa.com:
   - Debería ver SOLO "Producto User Test" 
   - Scope = 'own' solo permite ver sus propios datos

3. Si ambos ven los mismos datos = hay un problema
4. Si cada uno ve solo lo que debe = ¡funciona!

NOTA: Actualmente el frontend no usa las nuevas políticas RLS.
Necesitaremos actualizar el código para que funcione completamente.
*/