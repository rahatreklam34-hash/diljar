-- Bireysel moda geçiş: SaaS süper admin hesabını kaldır.
-- UserRole enum'undan SUPER_ADMIN çıkarılabilmesi için bu satırların temizlenmesi gerekir.
DELETE FROM "User" WHERE role = 'SUPER_ADMIN';
