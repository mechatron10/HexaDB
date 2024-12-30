require('dotenv').config();
const { count, error } = require('console');
const { Module } = require('module');
const net = require("net");
const emitter = require("events");
let ackEmitter=new emitter();
const redisDataTypes=require('./redisDataTypes');
const redisData=new redisDataTypes();
const serverProperties=require('./db').serverProperties;
const replica=require('./db').replica;
const db_config=require('./db').db_config;
const replicaList=require('./db').replicaList;
const MultiClientMap=require('./db').MultiClientMap;

let keyValueMap=require('./db').keyValueMap;
let replicaHandshake=require('./handelCommands').replicaHandshake;
let readRdbFile=require('./db').readRdbFile;
let handlePayload=require('./handelCommands').handlePayload;
let parseArgs=require('./db').parseArgs;


const server = net.createServer((connection) => {
  connection.on('data',async (data)=>
  {
    const binaryPayload=Buffer.from(data);
    let stringPayload=binaryPayload.toString();
    const response= await handlePayload(stringPayload,connection,data);
    console.log("Response is:",response);
   
    if(serverProperties)
    {
       serverProperties.master_repl_offset+=data.length;
    }
    if(Array.isArray(response))
   {
        console.log("respone of the psync command is :",response);
        connection.write(redisData.toSimpleResp(response[0])); 
        connection.write(response[1]);
        replicaList.push(connection);
        return ;
   }
       return connection.write(`${response}`||data);
  });

  connection.on('end',()=>{
      let index = replicaList.indexOf(connection);
     if (index !== -1) {
         replicaList.splice(index, 1);
        console.log('Connection removed from replicaList');
      }
  });

  connection.on('close', (hadError) => {
    console.log('Client disconnected', hadError ? 'with error' : '');
  });

  connection.on('error', (err) => {
         console.error('Connection error:', err);
      });
      process.on('SIGINT', async()=>{  
        for (let rep of replicaList) {
          console.log("Closing connection with replica: remote address--" + rep.remoteAddress + " remote port--" + rep.remotePort);
          
          await new Promise((resolve) => {
              rep.end(() => {
                  console.log("Connection with replica closed.");
                  resolve();
              });
  
              rep.on('error', (err) => {
                  console.error("Error while closing connection with replica:", err.message);
                  resolve();
              });
          });
      }
          process.exit(0);
       });
   });

parseArgs(db_config);
if(db_config.dbfilename)
readRdbFile();



server.listen(db_config.port, "127.0.0.1");


if(serverProperties.role=="slave")
{
   replicaHandshake();
}
console.log(`Server is listening at the port : ${db_config.port}`);
//  for (const [key, value] of keyValueMap.entries()) {
//     console.log(`Key: ${key}, Value: ${value}`);
// }