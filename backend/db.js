const { Pool } = require("pg");

const pool = new Pool({
  user: "admin",
  host: "localhost",
  database: "travel",
  password: "admin123",
  port: 5432,
});

module.exports = pool;