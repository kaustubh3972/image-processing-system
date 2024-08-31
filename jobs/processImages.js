const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const sharp = require("sharp");
const axios = require("axios");
const Queue = require("bull");

const imageProcessingQueue = new Queue("image-processing");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Initialize the S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

imageProcessingQueue.process(async (job, done) => {
	const { requestId, imageUrl } = job.data;
	try {
		const imageResponse = await axios({
			url: imageUrl,
			responseType: "arraybuffer",
		});
		const outputBuffer = await sharp(imageResponse.data)
			.resize({ width: 1000 })
			.toBuffer();

		const outputFilePath = path.join(
			__dirname,
			"processed-images",
			`${requestId}-${path.basename(imageUrl)}`
		);
		fs.writeFileSync(outputFilePath, outputBuffer);

		const s3Url = await uploadToS3(requestId, outputFilePath);
		await updateOutputUrlInDatabase(requestId, imageUrl, s3Url);

		done();
	} catch (error) {
		done(error);
	}
});

async function uploadToS3(requestId, filePath) {
	const fileContent = fs.readFileSync(filePath);
	const uploadParams = {
		Bucket: process.env.S3_BUCKET_NAME,
		Key: `processed-images/${requestId}/${path.basename(filePath)}`,
		Body: fileContent,
	};

	const command = new PutObjectCommand(uploadParams);
	const response = await s3Client.send(command);
	return `https://${process.env.S3_BUCKET_NAME}.s3.${
		process.env.AWS_REGION
	}.amazonaws.com/processed-images/${requestId}/${path.basename(filePath)}`;
}

async function updateOutputUrlInDatabase(requestId, inputUrl, outputUrl) {
	const client = await pool.connect();
	try {
		const updateText =
			"UPDATE products SET output_image_urls = array_append(output_image_urls, $1) WHERE request_id = $2 AND $3 = ANY(input_image_urls)";
		await client.query(updateText, [outputUrl, requestId, inputUrl]);
	} finally {
		client.release();
	}
}
