-- =====================================================
-- ARREGLAR CONSTRAINT DE ROLES EN TABLA USERS
-- =====================================================

-- 1. VERIFICAR CONSTRAINT ACTUAL
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'users'::regclass 
AND conname LIKE '%rol%';

-- 2. ELIMINAR CONSTRAINT EXISTENTE SI EXISTE
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rol_check;

-- 3. CREAR NUEVO CONSTRAINT QUE INCLUYA TODOS LOS ROLES
ALTER TABLE users 
ADD CONSTRAINT users_rol_check 
CHECK (rol IN ('admin', 'manager', 'user', 'viewer', 'cobrador', 'super_admin'));

-- 4. VERIFICAR QUE EL CONSTRAINT SE CREÓ CORRECTAMENTE
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'users'::regclass 
AND conname = 'users_rol_check';

-- 5. AHORA PUEDES INSERTAR EL USUARIO DE PRUEBA
-- (Ejecuta esto DESPUÉS de crear el usuario en Supabase Auth Dashboard)

/*
INSERT INTO users (id, tenant_id, email, nombre, rol, activo)
VALUES (
    'UUID_DEL_USUARIO_DE_SUPABASE_AUTH', -- Reemplazar con UUID real
    '11111111-1111-1111-1111-111111111111', -- Inversiones Paisa
    'user.test@inversionespaisa.com',
    'Prueba Usuario Visual',
    'user', -- Ahora debería funcionar
    true
);
*/

-- 6. VERIFICAR ROLES DISPONIBLES EN EL TENANT
SELECT 
    nombre as rol_name,
    scope,
    descripcion,
    es_admin
FROM roles 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
ORDER BY nombre;