require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

async function testDatabaseConnection() {
	try {
		const client = await pool.connect();
		console.log("Database connected successfully.");

		// Execute a simple query
		const result = await client.query("SELECT NOW()");
		console.log("Current Time:", result.rows[0].now);

		client.release();
	} catch (err) {
		console.error("Database connection error:", err);
	} finally {
		// End the pool to close all connections
		await pool.end();
	}
}

testDatabaseConnection();
