require("dotenv").config();
console.log(process.env.DATABASE_URL);
const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");
const Queue = require("bull"); // Ensure this line is added

const app = express();
const upload = multer({ dest: "uploads/" });
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

// Initialize the image processing queue
const imageProcessingQueue = new Queue("image-processing", {
	redis: {
		host: "127.0.0.1",
		port: 6379,
	},
});

app.post("/upload", upload.single("file"), (req, res) => {
	if (!req.file || req.file.mimetype !== "text/csv") {
		return res.status(400).json({ error: "Please upload a valid CSV file." });
	}

	const requestId = uuidv4();
	const results = [];

	fs.createReadStream(req.file.path)
		.pipe(csv())
		.on("data", (data) => {
			console.log("CSV Data:", data);
			// Additional validation and processing
		})
		.on("end", async () => {
			console.log("CSV Parsing Complete");
			await saveRequestToDatabase(requestId, results);
			fs.unlinkSync(req.file.path);
			res.status(200).json({ requestId });
		});
});

async function saveRequestToDatabase(requestId, data) {
	const client = await pool.connect();
	try {
		console.log("Starting database transaction...");
		await client.query("BEGIN");

		const insertRequestText =
			"INSERT INTO requests(request_id, status) VALUES($1, $2)";
		console.log("Inserting into requests...");
		await client.query(insertRequestText, [requestId, "Pending"]);

		const insertProductText =
			"INSERT INTO products(request_id, serial_number, product_name, input_image_urls) VALUES($1, $2, $3, $4)";
		for (const row of data) {
			console.log("Inserting into products...", row);
			await client.query(insertProductText, [
				requestId,
				row["Serial Number"],
				row["Product Name"],
				row["Input Image Urls"].split(","),
			]);
		}
		await client.query("COMMIT");
		console.log("Database transaction committed.");
	} catch (err) {
		console.error("Error in database transaction:", err);
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
	}
}
// Add this function to your existing code
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
	}
}

// Call this function to test the connection
testDatabaseConnection();

app.get("/status/:requestId", async (req, res) => {
	const { requestId } = req.params;
	const client = await pool.connect();
	try {
		const result = await client.query(
			"SELECT status FROM requests WHERE request_id = $1",
			[requestId]
		);
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Request not found." });
		}
		res.status(200).json(result.rows[0]);
	} finally {
		client.release();
	}
});

app.post("/webhook", (req, res) => {
	// Handle webhook payload
	res.status(200).send("Webhook received");
});

app.listen(3000, () => {
	console.log("Server is running on port 3000");
});
