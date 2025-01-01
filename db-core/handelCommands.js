const redisDataTypes=require('./redisDataTypes');
const redisData=new redisDataTypes();
const serverProperties=require('./db').serverProperties;
let replica=require('./db').replica;
const net = require("net");
const client =new net.Socket();
let db_config=require('./db').db_config;
let handshakeConfig=require('./db').handshakeConfig;
let readRdbFile=require('./db').readRdbFile;
let handleSave=require('./db').handleSave;
let keyValueMap=require('./db').keyValueMap;
const List = require('./List');
let replicaList=require('./db').replicaList;
let MultiClientMap=require('./db').MultiClientMap;
const Queue = require('./queue');
const Stream=require('./stream');
const fs=require("fs");
var streams=[];
function handeleEcho(payload)
{
  return redisData.toBulkResp(payload);
}
function propogateToReplicas(command) {
      if (serverProperties.role !== 'master' || replicaList.length <= 0) {
      return;
    }
  
    for (let replica of replicaList) {
      try {
        replica.write(command);
      } catch (error) {
        console.error(`Error: replica is undefined`);
        console.error(`Failed to propagate command to replica: ${replica.remoteAddress || 'unknown'}`);
      }
    }
  }
  function replicaHandshake()
  {
    replica.offset = 0;
    let client = new net.Socket();
    let master_url = db_config.master_host;
    let master_port = db_config.master_port;
    // console.log("master is at:", master_url);
    // console.log("master port is:", master_port);
    
    client.on('error', (error) => {
        console.error("Socket error:", error.message);
    });
    
    client.connect(master_port, master_url, async () => {
        const command1 = "*1\r\n$4\r\nPING\r\n";
        client.write(command1);
        client.on('data', async (data) => {
            let response = data.toString();
            try {
                if (response.includes('PONG')) {
                    handshakeConfig.ping = true;
                    const command2 = "*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n6380\r\n";
                    client.write(command2);
                    console.log(response);
                } else if (response.includes('OK')) {
                    if (!handshakeConfig.port) {
                        handshakeConfig.port = true;
                        console.log(response);
                        const command3 = "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n";
                        client.write(command3);
                    } else if (!handshakeConfig.capa) {
                        handshakeConfig.capa = true;
                        console.log(response);
                        const command4 = "*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n";
                        client.write(command4);
                    }
                } else if (!handshakeConfig.fullsync) {
                    console.log(response);
                    handshakeConfig.fullsync = true;
                } else if (!handshakeConfig.stateTransfer) {
                    handshakeConfig.stateTransfer = true;
                    console.log("The State of the master: " + data.toString("hex"));
                    readRdbFile(keyValueMap, data);
                } else {
                    const binaryPayload = Buffer.from(data);
                    let stringPayload = binaryPayload.toString(); // Convert the binary payload to string
                    replica.offset += data.length;
                    const commandResponse = await handlePayload(stringPayload, client, data);
                    console.log("The command is processed. Response is:", commandResponse);
                    return;
                }
            } catch (error) {
                console.error("Error processing data from master:", error.message);
            }
        });
          process.on('SIGINT',()=>{ 
               client.end(()=>{
                  console.log("client is now disconnected from the server");
                  process.exit(0);
                   })
              });
        client.on('error',(err)=>{ 
            console.log("connection error :", err);
        });
         client.on('end',()=>{
              console.log("master is shutting down");
          });
         client.on('close',()=>{
             console.log("Due to master shutdown slave is shutting down");
             process.exit(0);
         })
    });
  }
  async function handleCommand(length,args,connection,data)
{
   try 
   {
     let  [command]=args;
     console.log("command is:",command);
     const key=`${connection.remoteAddress}+${connection.remotePort}`
     switch(command.toUpperCase())
     {
       case"PING":
       {
        if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
          {
              MultiClientMap.get(key).commandsQueue.enqueue(data);
              return  "+QUEUED\r\n";
          }
         return redisData.toSimpleResp("PONG");
       }
       case"ECHO":
       {
        if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
        {
              MultiClientMap.get(key).commandsQueue.enqueue(data);
              return "+QUEUED\r\n";
          }
         return handleEcho(args.slice(2));
       }
       case"SET":
        {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
          let commandToReplica=`*${length}\r\n${args[0].length}\r\n`;
          for(let params of args)
          {
             commandToReplica+=`${params}\r\n`;
          }
    

          propogateToReplicas(commandToReplica);
          
          return handleSet(args.slice(2));
        }
       case "GET":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleGet(args.slice(2));
         }
       case "INFO":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleInfo(args.slice(2));
         }
       
       case "REPLCONF":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleReplconf(args.slice(2));
         }
       
       case "PSYNC":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handlePsync(args.slice(2));
         }
       case "WAIT":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleWait(args.slice(2));
         }
       case "CONFIG":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
             return handleConfig(args.slice(2));
         }
       case "KEYS":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleKeys(args.slice(2));
         }
       case "SAVE":
         {

          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleSave(args.slice(2));
         }
        case "INCR":
          {
            if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
              {
                  MultiClientMap.get(key).commandsQueue.enqueue(data);
                  return  "+QUEUED\r\n";
              }
              return handleIncr(args.slice(2));
          }
        case "MULTI":
        {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+Already MULTI \r\n";
            }
           return handleMutli(args.slice(2),connection);
        }
        case "EXEC":
          {
               if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==0)
              {
                return redisData.redisSimpleError({error:"ERR",errorMessage:"EXEC without MULTI\r\n"});
              }
             return handleExec(args.slice(2),connection);
          }
         case "DISCARD":
          {
            if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==0)
              {
                  return  redisData.redisSimpleError({error:"ERR",errorMessage:"DISCARD without MULTI"});
              }
             return handleDiscard(args.slice(2),connection);
          }
          case  "XADD":
          {
              let key=args[2];
              for(let str of streams)
              {
                if(str.getStreamKey()==key)
                {
                  let id=str.handleXADD(args.slice(4));
                  if(typeof id=='object')
                  {
                    return redisData.redisSimpleError(id);
                  }
                  return redisData.toBulkString(id);
                }
              }
              //if the stream does not exist
              let new_stream=new Stream();
              streams.push(new_stream);
              new_stream.setStreamName(key);
              let id=new_stream.handleXADD(args.slice(4));
              
              if(typeof id=='object')
                {
                  return redisData.redisSimpleError(id);
                }
              return redisData.toBulkString(id); 
          }
          case "XRANGE":
            { 
                 let streamKey=args[2];
                 let key1=args[4];
                 let key2=args[6];
                 let response;
                 for(let str of streams)
                  {
                    if(str.getStreamKey()==streamKey)
                    {
                      response= str.handleXrange(key1,key2);
                    }
                  }
                  console.log(response);
                  let RespArray=`$${response.length}\r\n`;
                  for (let ele of response) {
                    for (let [key, value] of Object.entries(ele)) {
                     RespArray+="2\r\n";
                     RespArray+=`$${key.length}\r\n`;
                     RespArray+=`${key}\r\n`;
                      for(let [key,data] of Object.entries(value))
                      {
                        RespArray+=`$${key.length}\r\n`;
                        RespArray+=`${key}\r\n`;
                        RespArray+=`$${data.length}\r\n`;
                        RespArray+=`${data}\r\n`;
                      }
                    }
                  }
                  return RespArray;
             }
             case "LPUSH":
              {
                  return handleLpush(args.slice(2));
              }
             case "LRANGE":
              {
                return handleLrange(args.slice(2));
              }
     }
     return null;//if no cases matches then null must be returned 
    }
     catch (error) {
      console.error("Error in handleCommand:", error);
      return redisData.redisSimpleError({
        error: "ERR",
        errorMessage: error.message || "Unknown error occurred.",
      });
    }
}
function handlePayload(payLoad, connection, data) {
  try {
    if (!payLoad || typeof payLoad !== "string") {
      throw new Error("Invalid payload: Payload is null, undefined, or not a string.");
    }

    if (payLoad.startsWith("$")) {
      const elems = payLoad.substr(1).split("\r\n");
      const length = parseInt(elems[0], 10);
      if (isNaN(length)) {
        throw new Error("Invalid payload: Length is not a number in bulk string format.");
      }
      return handleCommand(length, elems.slice(1), connection, data);
    } else if (payLoad.startsWith("*")) {
      const elems = payLoad.substr(1).split("\r\n");
      const length = parseInt(elems[0], 10);
      if (isNaN(length)) {
        throw new Error("Invalid payload: Length is not a number in bulk array format.");
      }
      return handleCommand(length, elems.slice(2), connection, data);
    }
    return handleCommand(payLoad);
  } 
  catch (error) {
    console.error("Error in handlePayload:", error);
    return redisData.redisSimpleError({
      error: "ERR",
      errorMessage: error.message || "Unknown error occurred while handling payload.",
    });
  }
}

function handleSet(key_value) {
  const parseValue = (value) => {
    const numberPattern = /^-?\d+$/;
    console.log("value is :", value);
    try {
      if (numberPattern.test(value)) {
        let parsedValue = Number(value); 
        if (!Number.isSafeInteger(parsedValue) && !isNaN(parseInt(value, 10))) {
          parsedValue = BigInt(value);
        }

        return parsedValue;
      } else {
        return value;
      }
    } catch (error) {
      console.error("Error while parsing value:", error.message);
      throw new Error("Failed to parse the value.");
    }
  };

  let expiryTime = 0; // Default expiry value of 0 means no expiry
  try {
    const valueToSet = [parseValue(key_value[2]), expiryTime];
    if (key_value[4] && key_value[4].toUpperCase() === "PX") {
      // If the PX parameter is present, calculate the expiry time in Unix format
      const currentTime = Date.now();
      let time = key_value[6];

      const expiryInMilliseconds = parseFloat(time);
      if (isNaN(expiryInMilliseconds)) {
        throw new Error("Invalid expiry time provided.");
      }

      // console.log("time: ", expiryInMilliseconds);
      // console.log(`currenttime :${Date.now()} , current time+ expiry time : ${Date.now() + expiryInMilliseconds}`);
      expiryTime = currentTime + expiryInMilliseconds;
      valueToSet[1] = expiryTime; // Update expiry time
    }
    keyValueMap.set(key_value[0], valueToSet);
    return redisData.toSimpleResp("OK");
  } catch (error) {
    console.error("Error in handleSet function:", error.message);
    throw new Error("Failed to set the key-value pair.");
  }
}

function handleGet(key) {
  try {
    console.log("key", key[0]);
    if (!keyValueMap.has(key[0])) {
      return "$-1\r\n"; // Key does not exist
    }

    const value = keyValueMap.get(key[0]);
    if (!Array.isArray(value) || value.length < 2) {
      throw new Error("Invalid value structure in keyValueMap");
    }
    
    const [storedValue, expiryTime] = value;
    if (expiryTime > 0 && Date.now() > expiryTime) {
      keyValueMap.delete(key[0]); // Remove expired key
      return "$-1\r\n"; // Key has expired
    }
    
    return redisData.toBulkResp([storedValue]);
  } catch (error) {
    console.error("Error in handleGet function:", error);
    return "-ERR Internal error occurred\r\n"; 
  }
}


function handleInfo(infoType)
{
   if(infoType[0].toUpperCase()=="REPLICATION")
   {
        return redisData.toBulkString(serverProperties);
   }
}
function handleReplconf(args) {
  try {
    if (!Array.isArray(args) || args.length === 0) {
      throw new Error("Invalid arguments provided to handleReplconf");
    }

    console.log("Inside the handle replconf");
    let arg1 = args[0];

    if (typeof arg1 !== "string") {
      throw new Error("First argument in REPLCONF must be a string");
    }

    if (arg1.toLowerCase() === "getack") {
      if (args.length < 3) {
        throw new Error("Insufficient arguments for GETACK command");
      }

      let arg2 = args[2];
      if (arg2 === "*") {
        if (replica?.offset) {
          return replica.offset; // Indicates the master is asking for the response
        } else {
          return `*3\r\n$8\r\nREPLCONF\r\n$3\r\nACK\r\n$1\r\n${serverProperties.master_repl_offset}\r\n`;
        }
      }
    }

    if (arg1.toLowerCase() === "ack") {
      if (args.length < 5) {
        throw new Error("Insufficient arguments for ACK command");
      }

      let offset = args[4];
      if (isNaN(parseInt(offset, 10))) {
        throw new Error("Invalid offset provided for ACK command");
      }

      ackEmitter.emit("slaveAck", offset);
    }

    return redisData.toSimpleResp("OK");
  } catch (error) {
    console.error("Error in handleReplconf:", error.message);
    return redisData.toSimpleResp("ERR " + error.message);
  }
}

function handlePsync(payload) {
  try {
      let dummy_message = `FULLRESYNC ${serverProperties.master_replid}`;
      let replica = true;

      const dirName = db_config.dir;
      const fileName = db_config.dbfilename;
      const filePath = dirName + "/" + fileName;

      if (!fs.existsSync(filePath)) {
          throw new Error(`RDB file not found at path: ${filePath}`);
      }

      const rdbFile = fs.readFileSync(filePath);

      if (!Buffer.isBuffer(rdbFile)) {
          throw new Error("Failed to read RDB file as a buffer.");
      }

      const rdbState = Buffer.from(rdbFile, 'hex');

      return [dummy_message, rdbState];
  } catch (error) {
      console.error("Error in handlePsync:", error.message);
      return [`-ERR ${error.message}`]; // Return an error message in RESP format
  }
}
async function handleWait(payload) {
  try {
    let ackneeded = payload[0];
    let time = payload[2];
    let count = 0;
    propogateToReplicas("*3\r\n$8\r\nREPLCONF\r\n\$6\r\nGETACK\r\n$1\r\n*\r\n");

    if (serverProperties.master_repl_offset == 0) {
      count = replicaList.length;
    } else {
      let updated = new Promise((resolve) => {
        try {
         
          let timeout = setTimeout(resolve, time);
          ackEmitter.on("slaveAck", (slaveOffset) => {
            try {
              if (slaveOffset == serverProperties.master_repl_offset) {
                count++;
              }
              if (count == ackneeded) {
                clearTimeout(timeout);
                resolve();
              }
            } catch (error) {
              console.error("Error in ackEmitter listener:", error);
              resolve(); 
            }
          });
        } catch (error) {
          console.error("Error in Promise for updated:", error);
          resolve(); 
        }
      });
      await updated;
    }

    return redisData.toRespInteger(count);
  } catch (error) {
    console.error("Error in handleWait:", error);
    return redisData.toRespInteger(-1); // Return a default error value
  }
}
function handleConfig(payload) {
  try {
    let subCommand = payload[0];
    let response;

    if (subCommand === "GET") {
      let respResponse = "";
      let parameters = payload.slice(1); 
      let no_of_parameters = 0;

      for (let i = 0; i < parameters.length; i++) {
        try {
          if (parameters[i] === "dir") {
            if (!db_config.dir || typeof db_config.dir !== "string") {
              throw new Error("Invalid directory configuration.");
            }
            respResponse += `$3\r\ndir\r\n$${db_config.dir.length}\r\n${db_config.dir}\r\n`;
            no_of_parameters++;
          } else if (parameters[i] === "dbfilename") {
            if (!db_config.dbfilename || typeof db_config.dbfilename !== "string") {
              throw new Error("Invalid database filename configuration.");
            }
            respResponse += `$10\r\ndbfilename\r\n$${db_config.dbfilename.length}\r\n${db_config.dbfilename}\r\n`;
            no_of_parameters++;
          }
        } catch (error) {
          console.error("Error processing parameter:", parameters[i], error);
        }
      }

      respResponse = `*${2 * no_of_parameters}\r\n` + respResponse;
      response = respResponse;
    }

    return response;
  } catch (error) {
    console.error("Error in handleConfig:", error);
    return redisData.toBulkString("ERROR: Unable to process config request.");
  }
}
function handleKeys(payload) {
  try {
    if (payload[0] === '*') {
      let respResponse = "";

      if (db_config.dir === '.' && db_config.dbfilename === '') {
        return "The rdb file does not exist";
      } else {
        let rdbKeys = new Map();

        try {
          readRdbFile(rdbKeys);
        } catch (error) {
          console.error("Error reading RDB file:", error);
          return redisData.toBulkString("ERROR: Unable to read RDB file.");
        }

        let no_of_keys = 0;

        try {
          for (const [key, value] of rdbKeys.entries()) {
            if (typeof key !== "string") {
              throw new Error("Invalid key format in RDB file.");
            }
            respResponse += `$${key.length}\r\n${key}\r\n`;
            no_of_keys++;
          }
        } catch (error) {
          console.error("Error processing keys from RDB file:", error);
          return redisData.toBulkString("ERROR: Unable to process keys from RDB file.");
        }

        respResponse = `*${no_of_keys}\r\n` + respResponse;
      }
      return respResponse;
    }
  } catch (error) {
    console.error("Error in handleKeys:", error);
    return redisData.toBulkString("ERROR: Unable to handle keys request.");
  }
}
function handleIncr(payload) {
  try {
    let incrKey = payload[0];
    if (!incrKey) {
      return redisData.redisSimpleError({ error: "ERR", errorMessage: "Invalid key provided\r\n" });
    }

    if (keyValueMap.has(incrKey)) {
      let value = keyValueMap.get(incrKey);
      if (!Array.isArray(value)) {
        return redisData.redisSimpleError({ error: "ERR", errorMessage: "Invalid data structure for key\r\n" });
      }

      let [storedValue, expiryTime] = value;

      // Check if the key has expired
      if (expiryTime > 0 && Date.now() > expiryTime) {
        keyValueMap.delete(incrKey); // Remove expired key
        keyValueMap.set(incrKey, [1, 0]);
        return ":1\r\n";
      }

      if (typeof storedValue !== "number") {
        return redisData.redisSimpleError({ error: "ERR", errorMessage: "value is not an integer or out of range\r\n" });
      }

      keyValueMap.set(incrKey, [storedValue + 1, expiryTime]);
      return redisData.toRespInteger(storedValue + 1);
    } else {
      keyValueMap.set(incrKey, [1, 0]);
      return ":1\r\n";
    }
  } catch (error) {
    console.error("Error in handleIncr function:", error);
    return redisData.redisSimpleError({ error: "ERR", errorMessage: "Failed to increment value\r\n" });
  }
}

function handleMutli(payload,connection)
   {
     const key=`${connection.remoteAddress}+${connection.remotePort}`
     console.log("key is :",key);
      MultiClientMap.set(key,{commandsQueue:new Queue(),is_multi:1});
      return "+OK\r\n";
   }
   async function handleExec(payload, connection) {
    try {
      const key = `${connection.remoteAddress}+${connection.remotePort}`;
      
      if (!MultiClientMap.has(key)) {
        throw new Error("Client key not found in MultiClientMap");
      }
  
      const clientData = MultiClientMap.get(key);
  
      if (!clientData || !clientData.commandsQueue) {
        throw new Error("Invalid client data structure or commandsQueue missing");
      }
  
      if (clientData.commandsQueue.size() == 0) {
        return "*0\r\n:";
      }
  
      let respResponse = "";
      let no_of_parameters = 0;
      clientData.is_multi = 0; 
  
      while (clientData.commandsQueue.getFrontIndex() != clientData.commandsQueue.getBackIndex()) {
        try {
          const data = clientData.commandsQueue.peek();
          clientData.commandsQueue.dequeue();
          
          const binaryPayload = Buffer.from(data);
          const stringPayload = binaryPayload.toString(); // Convert the binary payload to string form
          
          const response = await handlePayload(stringPayload, connection);
          respResponse += response;
          no_of_parameters += 1;
        } catch (commandError) {
          console.error("Error while processing command in EXEC:", commandError);
          respResponse += redisData.redisSimpleError({ error: "ERR", errorMessage: "Error processing command in queue\r\n" });
        }
      }
  
      console.log("The respResponse is:", respResponse);
      return respResponse;
    } catch (error) {
      console.error("Error in handleExec function:", error);
      return redisData.redisSimpleError({ error: "ERR", errorMessage: "Failed to execute commands in EXEC\r\n" });
    }
  }
  function handleDiscard(payload, connection) {
      try {
        const key = `${connection.remoteAddress}+${connection.remotePort}`;
    
        if (!MultiClientMap.has(key)) {
          throw new Error("Client key not found in MultiClientMap");
        }
    
        const clientData = MultiClientMap.get(key);
    
        if (!clientData || !clientData.commandsQueue) {
          throw new Error("Invalid client data structure or commandsQueue missing");
        }
    
        while (clientData.commandsQueue.getFrontIndex() != clientData.commandsQueue.getBackIndex()) {
          try {
            clientData.commandsQueue.dequeue();
          } catch (dequeueError) {
            console.error("Error dequeuing command in DISCARD:", dequeueError);
          }
        }
    
        clientData.is_multi = 0; // Reset MULTI state
        return redisData.toSimpleResp("OK");
      } catch (error) {
        console.error("Error in handleDiscard function:", error);
        return redisData.redisSimpleError({ error: "ERR", errorMessage: "Failed to discard commands\r\n" });
      }
    }
    function handleLpush(payload) {
      try {
        let key = payload[0];
        let value = payload[2];
    
        if (!key || value === undefined) {
          throw new Error("Invalid payload: Key or value is missing");
        }
    
        if (keyValueMap.has(key)) {
          const entry = keyValueMap.get(key);
    
          if (!Array.isArray(entry) || entry.length < 2) {
            throw new Error("Invalid data structure for key in keyValueMap");
          }
    
          let list = entry[0];
          if (list instanceof List) {
            try {
              list.addFront(value);
            } catch (listError) {
              console.error("Error adding value to the front of the list:", listError);
              return redisData.redisSimpleError({
                error: "ERR",
                errorMessage: "Failed to add value to the list\r\n",
              });
            }
            return redisData.toRespInteger(list.getSize());
          } else {
            return redisData.redisSimpleError({
              error: "ERR",
              errorMessage: "The value is not a list\r\n",
            });
          }
        } else {
          try {
            let list = new List();
            list.addFront(value);
            keyValueMap.set(key, [list, 0]); // Second value is the timestamp (0 means no expiry)
            return redisData.toRespInteger(list.getSize());
          } catch (createListError) {
            console.error("Error creating or adding to a new list:", createListError);
            return redisData.redisSimpleError({
              error: "ERR",
              errorMessage: "Failed to create or add value to the new list\r\n",
            });
          }
        }
      } catch (error) {
        console.error("Error in handleLpush function:", error);
        return redisData.redisSimpleError({
          error: "ERR",
          errorMessage: "Failed to process LPUSH command\r\n",
        });
      }
    }
    function handleLrange(payload)
  {
      try {
          let key = payload[0];
          if (!keyValueMap.has(key)) {
              return redisData.redisSimpleError({ error: "ERR", errorMessage: "The key does not exist" });
          }
          let list = keyValueMap.get(key)[0];
          console.log("list=", list);
          if (list instanceof List) {
              let start = payload[2];
              let end = payload[4];
              if (list.getSize() <= end || start < 0) {
                  return redisData.redisSimpleError({ error: "ERR", errorMessage: "The range is not valid" });
              }
              let elements = list.getRange(start, end);
              return redisData.toRespArray(elements);
          }
          else {
              return redisData.redisSimpleError({ error: "ERR", errorMessage: "The key does not contain a list" });
          }
      } catch (err) {
          return redisData.redisSimpleError({ error: "ERR", errorMessage: "An unexpected error occurred: " + err.message });
      }
  }
module.exports={handeleEcho,propogateToReplicas,replicaHandshake,handleSet,handleGet,handleInfo,handleReplconf,handlePsync,handleWait,handleConfig,handleKeys,handleIncr,handleMutli,handleDiscard,handleLpush,handleLrange,handlePayload};
