// test-bull.js
const Queue = require("bull");

const testQueue = new Queue("test-queue");

testQueue.add({ data: "test" });

testQueue.process((job, done) => {
	console.log("Processing job:", job.data);
	done();
});

console.log("Queue initialized and job added.");
