const { Pool } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_2MvedAqOpKf9@ep-billowing-flower-atimh18c-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: connectionString,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
