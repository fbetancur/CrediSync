-- =====================================================
-- ARREGLAR SCOPE DEL ROL ADMIN
-- =====================================================

-- El rol admin debe tener scope 'tenant' para ver todos los datos
-- Actualmente tiene scope 'own' lo cual es incorrecto

-- 1. VERIFICAR SCOPE ACTUAL DE ADMIN
SELECT 
    tenant_id,
    nombre,
    scope,
    es_admin,
    descripcion
FROM roles 
WHERE nombre = 'admin';

-- 2. CORREGIR SCOPE DE ADMIN A 'tenant'
UPDATE roles 
SET scope = 'tenant'
WHERE nombre = 'admin';

-- 3. VERIFICAR QUE SE CORRIGIÓ
SELECT 
    tenant_id,
    nombre,
    scope,
    es_admin,
    descripcion
FROM roles 
WHERE nombre = 'admin';

-- 4. VERIFICAR TODOS LOS ROLES CON SUS SCOPES CORRECTOS
SELECT 
    nombre as rol_name,
    scope,
    descripcion,
    es_admin,
    COUNT(*) as count_per_tenant
FROM roles 
WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
GROUP BY nombre, scope, descripcion, es_admin
ORDER BY 
    CASE nombre 
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2  
        WHEN 'user' THEN 3
        WHEN 'viewer' THEN 4
        WHEN 'cobrador' THEN 5
        ELSE 6
    END;