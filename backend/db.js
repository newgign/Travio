const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool(require('./config/database').databaseConfig());

module.exports = pool;
