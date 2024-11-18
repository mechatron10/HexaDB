// const net = require('net');
// const fs = require('fs');
// const pipePath = '\\\\.\\pipe\\mypipe'; // Path to named pipe (Windows example)

// // Connect to the server at 127.0.0.1:6379
// const client = net.createConnection({ host: '127.0.0.1', port: 6379 }, () => {
//   console.log('Connected to server at 127.0.0.1:6379');
// });

// // Create a read stream from the named pipe
// const pipeStream = fs.createReadStream(pipePath, { encoding: 'utf8' });

// pipeStream.on('data', (chunk) => {
//   // Split commands by newline and send each command to the server
//   const commands = chunk.trim().split('\n');
//   commands.forEach(command => {
//     console.log(`Sending command to server: ${command}`);
//     client.write(command + '\r\n');
//   });
// });

// pipeStream.on('error', (err) => {
//   console.error('Error reading from pipe:', err);
// });

// client.on('data', (data) => {
//   console.log('Received from server:', data.toString());
// });

// client.on('end', () => {
//   console.log('Disconnected from server');
// });

// client.on('error', (err) => {
//   console.error('Error:', err);
// });
const net = require('net');
// const pipePath = '\\\\.\\pipe\\mypipe`'; // Path to named pipe

// // Connect to the named pipe
// const pipeClient = net.createConnection(pipePath, () => {
//   console.log('Connected to named pipe');
// });
const client = net.createConnection({ host: '127.0.0.1', port: 6379 }, () => {
  console.log('Connected to server at 127.0.0.1:6379');
});
function writeCommand(client, command) {
  return new Promise((resolve) => {
    client.write(command);
    setTimeout(resolve, 4000); // Simulate delay
  });
}

async function executeCommands(client) {
  try {
    await writeCommand(client, "*1\r\n$4\r\nMULTI\r\n");
    await writeCommand(client, "*3\r\n$3\r\nset\r\n$3\r\nfoo\r\n$3\r\n10");
    await writeCommand(client, "*2\r\n$3\r\nget\r\n$3\r\nfoo\r\n");
    await writeCommand(client, "*1\r\n$4\r\nINCR\r\n$3\r\nfoo\r\n");
    await writeCommand(client, "*1\r\n$4\r\nEXEC\r\n");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

// Assuming 'client' is your active connection
executeCommands(client);

client.on('data', (data) => {
  console.log('Received from server:', data.toString());
});

client.on('end', () => {
  console.log('Disconnected from server');
});

client.on('error', (err) => {
  console.error('Error:', err);
});