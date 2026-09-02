const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'salfanet_user',
    password: '1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac',
    database: 'salfanet_radius'
  });
  const hash = '$2b$10$8O3NbqYypjI5icdI.FTEYedMmwexNqfvqyEy5OUGE7cjDkHj/U9T.';
  await conn.execute("UPDATE admin_users SET password=? WHERE username=?", [hash, 'superadmin']);
  console.log('Password updated');
  await conn.end();
})();
