const express = require('express');
const net = require('net');
const { spawn } = require('child_process'); 
const { SendCommand } = require('./Controller/apihandler');
const app = express();
app.use(express.json());
let serverProcess;

let isServerRunning = false;
if (!isServerRunning) {
    console.log("Starting the TCP server...");
    serverProcess = spawn('node', ['db-core/main.js', '--dbfilename', 'rdb.hex'], {
        detached: false,
        stdio: ['inherit', 'pipe', 'pipe'] 
    });
}
 serverProcess.stdout.on('data', (data) => {
       const output = data.toString();
       // console.log(`Server output: ${output}`);

        // Check if the server is ready
        if (output.includes("Server is listening at the port")) {
            console.log("TCP server is ready to accept connections.");
            isServerRunning = true; 
        }
   // console.log(`Server stdout: ${data}`);
});

serverProcess.stderr.on('data', (data) => {
    console.error(`Server stderr: ${data}`);
});


serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
});

async function ensureServerIsReady() {
    while (!isServerRunning) {
        console.log("Waiting for the server to be ready...");
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log("Server is ready. Proceeding with operations.");
}

(async () => {   
    await ensureServerIsReady();
})();

app.post('/sendCommand',SendCommand);

app.listen(3000, () => {
    console.log('HTTP server is running on port 3000');
});