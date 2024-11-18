require('dotenv').config();
const { count } = require('console');
const { Module } = require('module');
const net = require("net");
const { EventEmitter } = require('stream');
const emitter = require("events");
const buffer=require("buffer").Buffer;
const fs=require("fs");
// You can use print statements as follows for debugging, they'll be visible when running tests.
let keyValueMap=new Map();
const client =new net.Socket();
let ackEmitter=new emitter();
const Queue = require('./queue');//this is the class which is imported not the object of that class
// console.log(process.env.PORT);
const serverProperties={
   role:"master",
   master_replid:"8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb",
   master_repl_offset:0
};//since in the object we can store the key value pairs
let replica={};//this will be filled only when the server will be a replica
let db_config={
   dir : ".",
   dbfilename : "",
   port : 6379,
   master_host : "",
   master_port : ""
}
const handshakeConfig={
    ping: false,
    port : false,
    capa : false,
    fullsync: false,
    stateTransfer: false
};
var modeOfOperation=[0,false];//normally the redis will be in the normal mode 1--- for the multi mode
var MultiClientMap=new Map();
var replicaList=[];//this must not be constant
function replicaHandshake()
{
          replica.offset=0;       
          //now this server will do a ping to the master server 
          let client=new net.Socket();
          let master_url=db_config.master_host;
          let master_port=db_config.master_port;
          console.log("master is at :",master_url);
          console.log("master port is :",master_port);
         client.connect(master_port, master_url, async () => {
            const command1 = "*1\r\n$4\r\nPING\r\n";
            client.write(command1);
            client.on('data', async (data) => {
                const response = data.toString();
                if (response.includes('PONG')) {
                    // After receiving a response to the first command, send the second command
                    handshakeConfig.ping=true;
                    const command2 = "*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n6380\r\n";
                    client.write(command2);
                    console.log(response);
                } 
                else if (response.includes('OK')) {
                    // After receiving a response to the second command, send the third command
                   if(!handshakeConfig.port)
                   {
                     handshakeConfig.port=true;
                     console.log(response);
                     const command3 = "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n";
                     client.write(command3);
                   }
                    else if(!handshakeConfig.capa)
                    {
                        handshakeConfig.capa=true;
                        console.log(response);
                        const command4="*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n";
                        client.write(command4);
                    }
                    //now we will intiate the complete synchronization request
                }
                else if(!handshakeConfig.fullsync)
                {
                    console.log(response);//the data from the  command 4 will be captured here 
                    handshakeConfig.fullsync=true;
                  // after receiving the RDB state file the client will wait for the commands that are sent from the  client to the master and for the master to forward the commands to it 
                  //here we must not write the client.on because the client.on event listener is already added and will continue to exist for the lifetime of the program or if the client closes the connection with the master node 
                }
                else if(!handshakeConfig.stateTransfer)
                 {
                   //Receive the state of the master here
                    handshakeConfig.stateTransfer=true;
                    console.log("The State of the master: "+response);
                 } 
                 else 
                 {
                    // this must be the command now as the handshake must be complete
                    const binaryPayload=Buffer.from(data);
                    let stringPayload=binaryPayload.toString();//convert the binary payload to the string form
                    replica.offset+=data.length;
                    const response=await handlePayload(stringPayload);
                    console.log("The command is processed response is :",response);
                 }
            });
        });
}
function readRdbFile(map = keyValueMap) {
   const opCodes = {
     resizeDb: "fb",
   };
   let i = 0;
   const dirName = db_config.dir;
   const fileName = db_config.dbfilename;
   const filePath = dirName + "/" + fileName;
   const dataBuffer = fs.readFileSync(filePath);
   const getNextNBytes = (n) => {
     let nextNBytes = Buffer.alloc(n);
     for (let k = 0; k < n; k++) {
       nextNBytes[k] = dataBuffer[i];
       i++;
     }
     return nextNBytes;
   };

   const getNextObjLength = () => {
     const firstByte = dataBuffer[i];
     const twoBits = firstByte >> 6;
     let length = 0;
     switch (twoBits) {
       case 0b00:
         length = firstByte ^ 0b00000000;
         i++;
         break;
     }
     return length;
   };

   const hashTable = () => {
     const hashTableSize = getNextObjLength();
     return hashTableSize;
   };

   const expiryHashTable = () => {
     const expiryHashTableSize = getNextObjLength();
    return expiryHashTableSize;
   };
   const setTimeStamp=()=>{
       i++;//skipping the fc
       let timestamp = dataBuffer.readBigUInt64LE(i);
       return timestamp;
   }
   const resizeDb = () => {
     console.log("Inside resizedb");
     i++;
     const hashTableSize=hashTable();
     const expiryHashTableSize=expiryHashTable();//there is no expiry table in my implementation
     for(let j=0;j<hashTableSize;++j)
     {
      const currentB=dataBuffer[i].toString(16);
      let timestamp=0;  
      if(currentB=="fc")
       {
            timestamp=setTimeStamp();
            i=i+8;//to move to the value type and other things
       }
      const valueType=getNextNBytes(1);
      const keyLength = getNextObjLength();
      const key = getNextNBytes(keyLength);
      const valueLength = getNextObjLength();
      const value = getNextNBytes(valueLength);
      const valueToSet = [value.toString(), timestamp];
      // Set the key and value in the provided map or default to keyValueMap
      map.set(key.toString(), valueToSet);
     }
   };

   while (i < dataBuffer.length) {
     const currentHexByte = dataBuffer[i].toString(16);
     if (currentHexByte === opCodes.resizeDb) resizeDb();
     i++;
   }
}
function parseArgs(config) {
   const args = process.argv.slice(2); // Skip 'node' and script name in argv
   for (let i = 0; i < args.length; i++) {
     if (args[i] === "--port" && args[i + 1]) {
       config.port = parseInt(args[i + 1], 10);
       i++; // Skip next argument as it's the value for --port
     } else if (args[i] === "--dir" && args[i + 1]) {
       config.dir = args[i + 1];
       i++;
     } else if (args[i] === "--dbfilename" && args[i + 1]) {
       config.dbfilename = args[i + 1];
       i++;
     } else if (args[i] === "--replicaof" && args[i + 1]) {
       const [host, port] = args[i + 1].split(" ");
       config.master_host = host;
       config.master_port = parseInt(port, 10);
       i++;
       serverProperties.role="slave";
     }
   }
   return config;
 }
function redisSimpleError(errorObject)
{
   let Err=errorObject.error;
   let message=errorObject.errorMessage;
   if(Err=="ERR")
   {
    return `-ERR ${message}`;
   }
}
function toSimpleResp(message)
{
   return `+${message}\r\n`;
}
function toBulkResp(message) {
  console.log("Type of message is:",typeof message[0]);
  console.log("The message is :",message[0]);
  if (typeof message[0] === 'number') {
    return `$1\r\n${message[0]}\r\n`;
  }
  if (typeof message[0] === 'string') {
    let l = message[0].length;
    return `$${l}\r\n${message[0]}\r\n`;
  }
  // If it's not a string or number, handle other data types as needed
  return '$-1\r\n'; // Example response for unsupported types
}
function toRespInteger(int)
{
       if(int>0)
       {
         return `:+${int}\r\n`;
       }
        else if(int <0) 
       {
         return `:-${int}\r\n`;
       }
       return "0\r\n";
}
function toBulkString(payload)
{
   //payload is in the form of the object 
   let bulkString = "";
   let totalLength = 0;

    for (const key in payload) {
    // Constructing the key:value pair
    const pair = `${key}:${payload[key]}`;
    
    // Append to bulkString
    bulkString += pair;
    
    // Calculate the length of the current pair and add it to totalLength
    totalLength += pair.length;
    }  

// Prepend the total length and the required "\r\n" to bulkString
  bulkString = `$${totalLength}\r\n${bulkString}`;
  return bulkString;
}
function handeleEcho(payload)
{
  return toBulkResp(payload);
}
function propogateToReplicas(command)
{
   //we have to ensure that the replica is not sending to other replicas it may have 
   //as this function will be called inside the replicas as well 
   if(serverProperties.role!=='master'||replicaList.length<=0)
      return;
   for(let replica of replicaList)
   {
       replica.write(command);//command will be sent all the replicas
   }

}
function handleSet(key_value) {
   // key_value --- it is the array that contains the key and the values which are to be mapped together

   const  parseValue=(value)=> {
    // Regular expression to check if the string is a number
    const numberPattern = /^-?\d+$/; // Matches positive or negative integers
    console.log("value is :",value);
    if (numberPattern.test(value)) {
      // If value matches the number pattern, convert it to a number
      // parseInt can be replaced with Number() to accommodate larger values (e.g., BigInt)
      console.log("Yes this value is a number");
      let parsedValue = Number(value); // Automatically chooses appropriate type (int, float)
      
      // Optionally, use BigInt for extremely large values
      if (!Number.isSafeInteger(parsedValue) && !isNaN(parseInt(value, 10))) {
        parsedValue = BigInt(value);
      }
  
      return parsedValue;
    } 
    else {
      // If not a number, keep it as a string
      return value;
    }
  }
   let expiryTime = 0; // Default expiry value of 0 means no expiry
   const valueToSet = [parseValue(key_value[2]), expiryTime];
   console.log("expiry time in miliseconds :", expiryTime);
   if (key_value[4] && key_value[4].toUpperCase() === "PX") {
     // If the PX parameter is present, calculate the expiry time in Unix format
     const currentTime = Date.now();
     let time=key_value[5].split(":")[1];
     console.log("time:", time);
     const expiryInMilliseconds = parseInt(time, 10);
     expiryTime = currentTime + expiryInMilliseconds;
     valueToSet[1] = expiryTime; // Update expiry time
   }
   keyValueMap.set(key_value[0], valueToSet);
   return toSimpleResp("OK");
 }
 
function handleGet(key) {
   console.log("key", key[0]);
   if (!keyValueMap.has(key[0])) {
     return "$-1\r\n"; // Key does not exist
   }
 
   const value = keyValueMap.get(key[0]);
   const [storedValue, expiryTime] = value;
   // Check if the key has expired
   console.log("The type of the stored value is :",typeof(storedValue));
   if (expiryTime > 0 && Date.now() > expiryTime) {
     keyValueMap.delete(key[0]); // Remove expired key
     return "$-1\r\n"; // Key has expired
   }
   return toBulkResp(storedValue);
 }
function handleInfo(infoType)
{
   if(infoType[0].toUpperCase()=="REPLICATION")
   {
        return toBulkString(server_properties);
   }
}
function handleReplconf(args)
{
   //there are two ways to handle this 
   //Now return the answer on the basis of the arguments
   console.log("inside the handle replconf");
   let arg1=args[0];
   if(arg1.toLowerCase()==="getack")
   {
      let arg2=args[2];
      if(arg2==="*")
         if(replica?.offset)
         return replica.offset;//this indicates its the master that is asking for the  response
         else
         return  `*3\r\n$8\r\nREPLCONF\r\n$3\r\nACK\r\n$1\r\n${serverProperties.master_repl_offset}\r\n`
   }
   if(arg1.toLowerCase()==="ack")
      {
         let offset=args[4];
         ackEmitter.emit("slaveAck", offset);
      }
   return toSimpleResp("OK");
}
function handlePsync(payload)
{
   let dummy_message=`FULLRESYNC ${serverProperties.master_replid}`;
   let replica=true;
   const base64="UkVESVMwMDEx+glyZWRpcy12ZXIFNy4yLjD6CnJlZGlzLWJpdHPAQPoFY3RpbWXCbQi8ZfoIdXNlZC1tZW3CsMQQAPoIYW9mLWJhc2XAAP/wbjv+wP9aog==";
   const  rdbBuffer=Buffer.from(base64,'base64');//this will cconvert the base 64 format into the UTF encoding
   const rdbHead=Buffer.from(`$${rdbBuffer.length}\r\n`);
   const rdbstate=Buffer.concat([rdbHead,rdbBuffer]);
   //console.log("buffer_concat result is= :"+[rdbHead, rdbBuffer]);
   //The client here is the master node or the master database
   return ([dummy_message,replica,rdbstate]);//array can be returned may be
}
// Uncomment this block to pass the first stage
// function processReplicasWithTimeout( ackneeded, time) {
//    console.log("in the function processing");  
//    setTimeout(() => {
//        return  obj.count; // Resolve the promise (timeout reached) and return the count
//      }, time);
//      for (let replica of replicaList) {
//       replica.write("*3\r\n$8\r\nREPLCONF\r\n\$6\r\nGETACK\r\n$1\r\n*\r\n");
//       if(obj.count==ackneeded)
//       {
//          return obj.count;
//       }
//    }
//  }
//  function processReplicasWithTimeout(ackneeded, time) {
//    return new Promise(async (resolve, reject) => {
//      let obj = { count: 0 };
 
//      // Handle the timeout: resolve the promise after the given time
//      setTimeout(() => {
//        console.log("Timeout reached, returning:", obj.count);
//        resolve(obj.count); // Resolve the promise with the count when the timeout is reached
//      }, time);
 
//      // Simulate processing replicas
    

//    });
//  }
async  function handleWait(payload)
{
   //payload contains only the time
   let ackneeded=payload[0];
   let time=payload[2];

   //now either wait for the timeout or just send the commands to the slave
   //just
   let count=0;
   console.log("The time ack ",time);
   console.log("The no. of acks",ackneeded);
   propogateToReplicas("*3\r\n$8\r\nREPLCONF\r\n\$6\r\nGETACK\r\n$1\r\n*\r\n");
   if (serverProperties.master_repl_offset == 0) {
      count = replicaList.length;
   }
  else
  {
      let updated = new Promise((resolve) => {
      // whatever happens first fullfills the promise
      let timeout = setTimeout(resolve,time);
       ackEmitter.on("slaveAck", (slaveOffset) => {
          if (slaveOffset == serverProperties.master_repl_offset) {
              count++;
          }
          if (count == ackneeded) {
              clearTimeout(timeout);
              resolve();
          }
      });
     });
     await updated;
  }

   console.log("count is:",count);
   return toRespInteger(count);
}
function handleConfig(payload)
{
    let subCommand=payload[0];
    let response;
    if(subCommand=="GET")
    {
        let respResponse="";
        let parameters=payload.slice(1);//this parameters is an array
        let no_of_parameters=0;
        for (let i = 0; i < parameters.length; i++) {
         if (parameters[i] === "dir" ) {
           respResponse+=`$3\r\ndir\r\n$${db_config.dir.length}\r\n${db_config.dir}\r\n`;
           no_of_parameters++;
         } 
         else if (parameters[i] === "dbfilename" ) 
            {
            respResponse+=`$10\r\ndbfilename\r\n$${db_config.dbfilename.length}\r\n${db_config.dbfilename}\r\n`;
            no_of_parameters++;
         }
       }
       respResponse=`*${2*no_of_parameters}\r\n`+respResponse;
       response=respResponse;
    }
    return response;
}

//payload contains all the values of the command after it 
function handleKeys(payload)
{
   if(payload[0]=='*')
   {
      let respResponse="";
      //then we have to return all the keys that are present in the rdb file 
      if(db_config.dir=='.'&&db_config.dbfilename=='')
      {
         return ("The rdb file does not exist");
      }
      else
      {
         let rdbKeys=new Map();
        
         readRdbFile(rdbKeys);
         let no_of_keys=0;

         for (const [key, value] of rdbKeys.entries()) {
            respResponse+=`$${key.length}\r\n${key}\r\n`;
            no_of_keys++;
         } 
         respResponse=`*${no_of_keys}\r\n`+respResponse;
        }
        return respResponse;
     }

   }
   function handleSave()
   { 
      
     let  lengthEncoding= (size)=> {
         let lengthBuffer;
         if (size < 63) {
           // 0A
           lengthBuffer = Buffer.alloc(1); // Allocating 1 byte for integer
           size = size & 0b00111111;
           lengthBuffer.writeUInt8(size);
         }
         if (size > 63) {
           lengthBuffer = Buffer.alloc(2);
           size = (size & 0b0011111111111111) | 0b0100000000000000;
           lengthBuffer.writeUInt16BE(size);
         }
         if (size > 16383) {
           lengthBuffer = Buffer.alloc(5); // Allocate 5 bytes for the buffer
       
           // Set the first byte to 10000000 (binary), which is 0x80 in hex
           lengthBuffer.writeUInt8(0x80, 0);
           lengthBuffer.writeUInt32BE(size, 1);
         }
         return lengthBuffer;
       }
       //firstly get the current state of the db 
       const dirName = db_config.dir;
       const fileName = db_config.dbfilename;
       const filePath = dirName + "/" + fileName;
       let rdb=buffer.from([
         0x52, 0x45, 0x44, 0x49, 0x53,   // "REDIS"
         0x30, 0x30, 0x30, 0x33,         // "0003"
         0xFE, 0x00,,0xFB,
       ]);
       let keyMapSize=keyValueMap.size;
       let expiryMapSize =0;
       // Write as big-endian 32-bit integer
       let keyMapSizeBuffer=lengthEncoding(keyMapSize);
       let expiryMapSizeBuffer=lengthEncoding(expiryMapSize);
       rdb = Buffer.concat([rdb, keyMapSizeBuffer, expiryMapSizeBuffer]);
       for(const[key,value]of keyValueMap.entries())
       {
         console.log(key);
         console.log(value);
            if(value[1]==0)//no epiry
            {
               const typeBuffer = Buffer.from([0x00]); // Create a buffer from the number 0x55
               let k=Buffer.from(key);
               let string_encoded_key=Buffer.concat([lengthEncoding(key.length),k]);
               let val=Buffer.from(value[0]);
               let string_encoded_value=Buffer.concat([lengthEncoding(val.length),val]);
               rdb = Buffer.concat([rdb, typeBuffer,string_encoded_key,string_encoded_value]); // Concatenate with rdb
            }
            else // expiry in miliseconds for now 
            {
                const expiryBuffer=Buffer.from([0xFC]);
                const timestamp = Buffer.alloc(8); // Assume this is a Unix timestamp in milliseconds // Allocate an 8-byte buffer
                timestamp.writeBigUInt64LE(BigInt(value[1]), 0); // Write the timestamp as a 64-bit unsigned integer in little-endian format
                const typeBuffer = Buffer.from([0x00]); // Create a buffer from the number 0x55
                let k=Buffer.from(key);
                let string_encoded_key=Buffer.concat([lengthEncoding(key.length),k]);
                let val=Buffer.from(value[0]);
                let string_encoded_value=Buffer.concat([lengthEncoding(val.length),val]);
                rdb = Buffer.concat([rdb,expiryBuffer,timestamp,typeBuffer,string_encoded_key,string_encoded_value]); // Concatenate with rdb
            }
       } 
       fs.writeFileSync(filePath,rdb);
      //perform the overwrite operation of this rdb file to the existing rdb files
      return toSimpleResp("OK");
   }
   function handleIncr(payload)
   {
    let incrKey=payload[0];
      if (keyValueMap.has(incrKey)) {
        let value=keyValueMap.get(incrKey);
        let [storedValue, expiryTime] = value;
        if(expiryTime > 0 && Date.now() > expiryTime)
        {
          keyValueMap.delete(incrKey); // Remove expired key
          keyValueMap.set(incrKey,[1,0]);
          return ":1\r\n";
        }
        if(typeof storedValue!=='number')
        {
          //of the form errorType , message
          return redisSimpleError({error:"ERR",errorMessage:"value is not an integer or out of range\r\n"});
        }
        keyValueMap.set(incrKey,[storedValue+1,expiryTime]);
        return toRespInteger(storedValue+1);
      }
        //handled differently
       
    
     else
     {
        keyValueMap.set(incrKey,[1,0]);
        return ":1\r\n";
     }
 

  
   // Check if the key has expired
  //  if (expiryTime > 0 && Date.now() > expiryTime) {
  //    keyValueMap.delete(key[0]); // Remove expired key
  //    return "$-1\r\n"; // Key has expired
  //  }
   }

   function handleMutli(payload,connection)
   {
     const key=`${connection.remoteAddress}+${connection.remotePort}`
     console.log("key is :",key);
      MultiClientMap.set(key,{commandsQueue:new Queue(),is_multi:1});//response of the MULTI must be send
      return "+OK\r\n";
   }
   async function handleExec(payload,connection)
   {
     const key=`${connection.remoteAddress}+${connection.remotePort}`
      if(MultiClientMap.get(key).commandsQueue.size()==0)
      {
         return "*0\r\n:";
      }
      
      let respResponse="";
      let no_of_parameters=0;
      MultiClientMap.get(key).is_multi=0;//which means now this client commands will be executed
       //else we have to push the commands in the commandsQueue
       while(MultiClientMap.get(key).commandsQueue.getFrontIndex()!=MultiClientMap.get(key).commandsQueue.getBackIndex())
       {
        const data=MultiClientMap.get(key).commandsQueue.peek();
        MultiClientMap.get(key).commandsQueue.dequeue();
        const binaryPayload=Buffer.from(data);
        let stringPayload=binaryPayload.toString();//convert the binary payload to the string form
        const response= await handlePayload(stringPayload,connection);
        respResponse+=response;
        no_of_parameters+=1;
        }
        console.log("The respResponse is :",respResponse);
        return respResponse;
      }
      function handleDiscard(payload,connection)
      {
          const key=`${connection.remoteAddress}+${connection.remotePort}`;
          while(MultiClientMap.get(key).commandsQueue.getFrontIndex()!=MultiClientMap.get(key).commandsQueue.getBackIndex())
            {
             MultiClientMap.get(key).commandsQueue.dequeue();
             }
             MultiClientMap.get(key).is_multi=0; 
             return toSimpleResp("OK");
      }
 async function handleCommand(length,args,connection,data)
{
  //args they are the command and the arguments togethers
     let  [command]=args;
     console.log("command is:",command);
     console.log("all the arguments are:",args);
     const key=`${connection.remoteAddress}+${connection.remotePort}`
     switch(command.toUpperCase())
     {
       case"PING":
       {
        if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
          {
              console.log("yes the client is a part of the MULTI command");
              MultiClientMap.get(key).commandsQueue.enqueue(data);
              return  "+QUEUED\r\n";
          }
         return toSimpleResp("PONG");
       }
       case"ECHO":
       {
        if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
        {
              console.log("yes the client is a part of the MULTI command");
              MultiClientMap.get(key).commandsQueue.enqueue(data);
              return "+QUEUED\r\n";
          }
         return handeleEcho(args.slice(2));//because the args are like this for example ["echo","$2","hello"]; then 2 is not needed to be outputted
         //In the code the handleEchofunction was also defined that will firstly pass the arguments to the toResp and then will return the final output
       }
       case"SET":
        {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
          let commandToReplica=`*${length}\r\n${args[0].length}\r\n`;
          for(let params of args)
          {
             commandToReplica+=`${params}\r\n`;
          }
          propogateToReplicas(commandToReplica);//will have to form the command for them with the arguments mentioned
          return handleSet(args.slice(2));
        }
       case "GET":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleGet(args.slice(2));
         }
       case "INFO":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleInfo(args.slice(2));
         }
       
       case "REPLCONF":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleReplconf(args.slice(2));
         }
       
       case "PSYNC":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handlePsync(args.slice(2));
         }
       case "WAIT":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleWait(args.slice(2));
         }
       case "CONFIG":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
             return handleConfig(args.slice(2));
         }
       case "KEYS":
         {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleKeys(args.slice(2));
         }
       case "SAVE":
         {

          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+QUEUED\r\n";
            }
            return handleSave(args.slice(2));
         }
        case "INCR":
          {
            if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
              {
                  console.log("yes the client is a part of the MULTI command");
                  MultiClientMap.get(key).commandsQueue.enqueue(data);
                  return  "+QUEUED\r\n";
              }
              return handleIncr(args.slice(2));
          }
        case "MULTI":
        {
          if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==1)
            {
                console.log("yes the client is a part of the MULTI command");
                MultiClientMap.get(key).commandsQueue.enqueue(data);
                return  "+Already MULTI \r\n";
            }
           return handleMutli(args.slice(2),connection);
        }
        case "EXEC":
          {
               if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==0)
              {
                return redisSimpleError({error:"ERR",errorMessage:"EXEC without MULTI\r\n"});
              }
             return handleExec(args.slice(2),connection);
          }
         case "DISCARD":
          {
            if(MultiClientMap.has(key)&&MultiClientMap.get(key).is_multi==0)
              {
                  return  redisSimpleError({error:"ERR",errorMessage:"DISCARD without MULTI"});
              }
             return handleDiscard(args.slice(2),connection);
          }
     }
     return null;//if no cases matches then null must be returned 

}
function handlePayload(payLoad,connection,data)
{
   if(!payLoad)
   {
    return payLoad;
   }
   if(payLoad.startsWith("$"))
   { 
      const elems=payLoad.substr(1).split("\r\n");
      return handleCommand(parseInt(elems[0],10),elems.slice(1),connection,data);//length is not correct here it is NAN 
   }
   else if(payLoad.startsWith("*"))//then it is the bulk array
   {
     const elems=payLoad.substr(1).split("\r\n");
     return handleCommand(parseInt(elems[0],10),elems.slice(2),connection,data);//length and the elems of the payLoad 
   }
   return handleCommand(payLoad);
}
const server = net.createServer((connection) => {
  //on the first time connection PONG will be given in the output 
 //whenever any data will be sent the data send will be give in the output
 //connection represents the client object which has connected to the server
  connection.on('data',async (data)=>
  {
    //we need to firstly convert the received data to the string form 
    //data is the command from the client 
    //here we can keep the flag for any of the commands that we receive from the replica ,for example the first command will be the ping from the replica
    //for loop will also come to propogate the commands to the replica
    const binaryPayload=Buffer.from(data);
    let stringPayload=binaryPayload.toString();//convert the binary payload to the string form
    const response= await handlePayload(stringPayload,connection,data);
    console.log("The length of the data is :", data.length);
    console.log("Response is:",response);
   
    if(serverProperties)
    {
       serverProperties.master_repl_offset+=data.length;//adding the commands offset to the master
    }
    if(Array.isArray(response))
   {
        console.log("respone of the psync command is :"+response);
        connection.write(toSimpleResp(response[0]));//this is the master_replication_id
        //Now we will send the state of the master to the replica connected to it 
        connection.write(response[2]);
        replicaList.push(connection);
        return ;
   }
       return connection.write(`${response}`||data);//if the response is null then we are returning the data or the command received as the output directly 
  })
   });
parseArgs(db_config);
// Now load the redis RDB file
//readRdbFile();
server.listen(db_config.port, "127.0.0.1");
if(serverProperties.role=="slave")
{
   replicaHandshake();//handshake has to be performed then
}
console.log(`Server is listening at the port : ${db_config.port}`);
console.log("After reading the complete RDB file :");
 for (const [key, value] of keyValueMap.entries()) {
    console.log(`Key: ${key}, Value: ${value}`);
} 
// //problem how to make the parser for the redis commands 
// //The communication between the server and the client happens in the resp protocol so we will have to make the parser which will be able to parse the command and then can distinguish what type of command it is , its arguments etc

  