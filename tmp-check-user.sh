#!/bin/bash
mysql -u salfanet_user -psalfanetradius123 salfanet_radius 2>/dev/null <<'SQL'
SELECT '--- ADMIN USERS ---';
SELECT id, username, role FROM admin_users;
SELECT '--- USER PERMISSIONS (custom) ---';
SELECT up.userId, up.permissionId FROM user_permissions up LIMIT 10;
SELECT '--- ROLE PERMISSIONS for SUPER_ADMIN ---';
SELECT COUNT(*) as count FROM role_permissions WHERE role='SUPER_ADMIN';
SELECT '--- SAMPLE ROLE PERMS ---';
SELECT p.key FROM permissions p JOIN role_permissions rp ON rp.permissionId = p.id WHERE rp.role='SUPER_ADMIN' AND p.key IN ('settings.payment','users.view','settings.view','settings.edit') ORDER BY p.key;
SQL
