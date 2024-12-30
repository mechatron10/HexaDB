const SendCommand=()=>{
    const { message } = req.body;
console.log("message: ", message);
const tcpClient = new net.Socket();
tcpClient.connect(6379, '127.0.0.1', () => {
tcpClient.write(message);
  });
tcpClient.on('data', (data) => {
    console.log('Response from TCP server:', data.toString());
    res.send({ message: 'Response from TCP server', data: data.toString() });
    tcpClient.destroy(); // Close the TCP connection
});
tcpClient.on('error', (err) => {
    console.error('Error connecting to TCP server:', err);
    res.status(500).send({ error: 'Failed to connect to TCP server' });
});   
}
module.exports={SendCommand};