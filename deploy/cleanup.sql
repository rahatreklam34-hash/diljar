DELETE FROM "Tenant" WHERE id IN (SELECT "tenantId" FROM "User" WHERE email LIKE '%@example.com');
SELECT count(*) AS kalan_firma FROM "Tenant";
SELECT email FROM "User";
