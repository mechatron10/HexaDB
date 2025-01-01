const serverProperties={
    role:"master",
    master_replid:"8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb",
    master_repl_offset:0
 };
 const redisDataTypes=require('./redisDataTypes');
 const redisData=new redisDataTypes();
 const List = require('./List');
 let replica={};
 let fs=require('fs');
let db_config={
   dir : "./db-core",
   dbfilename : " rdb.hex",
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
let keyValueMap=new Map();
var MultiClientMap=new Map();
var replicaList=[];//this must not be constant
function readRdbFile(map = keyValueMap, file) {
    try {
      console.log("Inside RDB");
  
      const opCodes = {
        resizeDb: "fb",
      };
  
      let i = 0;
      const dirName = db_config.dir;
      const fileName = db_config.dbfilename;
      const filePath = dirName +"/"+ fileName;
  
      let dataBuffer;
  
      try {
        dataBuffer = file !== undefined ? Buffer.from(file) : fs.readFileSync(filePath);
      } catch (err) {
        throw new Error(`Error reading file: ${err.message}`);
      }
  
      console.log("Data buffer is: ", dataBuffer);
  
      const getNextNBytes = (n) => {
        if (i + n > dataBuffer.length) {
          throw new Error(`Attempt to read out of bounds at index ${i} for ${n} bytes`);
        }
        let nextNBytes = Buffer.alloc(n);
        for (let k = 0; k < n; k++) {
          nextNBytes[k] = dataBuffer[i];
          i++;
        }
        return nextNBytes;
      };
  
      const getNextObjLength = () => {
        if (i >= dataBuffer.length) {
          throw new Error(`Out of bounds while determining object length at index ${i}`);
        }
        const firstByte = dataBuffer[i];
        const twoBits = firstByte >> 6;
        let length = 0;
  
        switch (twoBits) {
          case 0b00:
            length = firstByte ^ 0b00000000;
            i++;
            break;
          case 0b01:
            if (i + 1 >= dataBuffer.length) {
              throw new Error("Not enough bytes to calculate length for 14-bit value");
            }
            length = ((dataBuffer[i] << 8) | dataBuffer[i + 1]) & 0b0011111111111111;
            i += 2;
            break;
          case 0b10:
            if (i + 4 >= dataBuffer.length) {
              throw new Error("Not enough bytes to calculate length for 32-bit value");
            }
            length = dataBuffer.readUInt32BE(i + 1);
            i += 5;
            break;
          default:
            throw new Error(`Invalid two-bit length prefix at index ${i}`);
        }
        return length;
      };
  
      const hashTable = () => {
        try {
          return getNextObjLength();
        } catch (err) {
          throw new Error(`Error reading hash table size: ${err.message}`);
        }
      };
  
      const expiryHashTable = () => {
        try {
          return getNextObjLength();
        } catch (err) {
          throw new Error(`Error reading expiry hash table size: ${err.message}`);
        }
      };
  
      const setTimeStamp = () => {
        try {
          i++; // Skipping the "fc" byte
          if (i + 8 > dataBuffer.length) {
            throw new Error("Not enough bytes to read timestamp");
          }
          let timestamp = dataBuffer.readBigUInt64LE(i);
          i += 8;
          return timestamp;
        } catch (err) {
          throw new Error(`Error reading timestamp: ${err.message}`);
        }
      };
  
      const resizeDb = () => {
        try {
          console.log("Inside resizeDb");
          i++;
          const hashTableSize = hashTable();
          const expiryHashTableSize = expiryHashTable();
  
          console.log("HashTableSize =", hashTableSize);
          console.log("ExpiryHashTableSize =", expiryHashTableSize);
  
          for (let j = 0; j < hashTableSize; ++j) {
            const currentB = dataBuffer[i]?.toString(16);
            if (!currentB) {
              throw new Error(`Invalid byte at index ${i}`);
            }
  
            console.log("The current Byte is:", currentB);
  
            let timestamp = 0;
            if (currentB === "fc") {
              timestamp = setTimeStamp();
            }
  
            const valueType = getNextNBytes(1)[0];
            const keyLength = getNextObjLength();
            const key = getNextNBytes(keyLength);
  
            console.log("Key is:", key.toString());
            console.log("Value type is:", valueType);
  
            if (valueType === 0) {
              const valueLength = getNextObjLength();
              const value = getNextNBytes(valueLength);
              const valueToSet = [value.toString(), timestamp];
              console.log(valueToSet);
              map.set(key.toString(), valueToSet);
            } else if (valueType === 1) {
              const listLength = getNextObjLength();
              let list = !map.has(key.toString())
                ? new List()
                : map.get(key.toString())[0];
              let stringCount = 0;
  
              console.log("Length of the list is:", listLength);
  
              while (stringCount < listLength) {
                const valueLength = getNextObjLength();
                const value = getNextNBytes(valueLength);
                console.log("Value is:", value.toString());
                list.addBack(value.toString());
                stringCount++;
              }
              map.set(key.toString(), [list, timestamp]);
            }
          }
        } catch (err) {
          throw new Error(`Error in resizeDb: ${err.message}`);
        }
      };
  
      while (i < dataBuffer.length) {
        try {
          const currentHexByte = dataBuffer[i]?.toString(16);
          if (!currentHexByte) {
            throw new Error(`Invalid byte at index ${i}`);
          }
          if (currentHexByte === opCodes.resizeDb) resizeDb();
          i++;
        } catch (err) {
          console.error(`Error processing byte at index ${i}: ${err.message}`);
          i++;
        }
      }
    } catch (err) {
      console.error(`Critical error in readRdbFile: ${err.message}`);
    }
  }

  function handleSave() { 
    try {
      let lengthEncoding = (size) => {
        try {
          let lengthBuffer;
          if (size < 63) {
            lengthBuffer = Buffer.alloc(1); 
            size = size & 0b00111111;
            lengthBuffer.writeUInt8(size);
          } else if (size > 63 && size <= 16383) {
            lengthBuffer = Buffer.alloc(2);
            size = (size & 0b0011111111111111) | 0b0100000000000000;
            lengthBuffer.writeUInt16BE(size);
          } else if (size > 16383) {
            lengthBuffer = Buffer.alloc(5);
            lengthBuffer.writeUInt8(0x80, 0);
            lengthBuffer.writeUInt32BE(size, 1);
          }
          return lengthBuffer;
        } catch (error) {
          console.error("Error in lengthEncoding function:", error);
          throw error; 
        }
      };
  
      // First, get the current state of the DB
      const dirName = db_config.dir;
      const fileName = db_config.dbfilename;
      console.log("directory name:", dirName," fileName :",fileName);
      const filePath = dirName + "/" + fileName;
      console.log("filePath: ",filePath);
      let rdb = Buffer.from([
        0x52, 0x45, 0x44, 0x49, 0x53,   // "REDIS"
        0x30, 0x30, 0x30, 0x33,         // "0003"
        0xFE, 0x00, 0xFB,
      ]);
  
      try {
        let keyMapSize = keyValueMap.size;
        let expiryMapSize = 0;
        let keyMapSizeBuffer = lengthEncoding(keyMapSize);
        let expiryMapSizeBuffer = lengthEncoding(expiryMapSize);
        rdb = Buffer.concat([rdb, keyMapSizeBuffer, expiryMapSizeBuffer]);
  
        for (const [key, value] of keyValueMap.entries()) {
          try {
            console.log(key);
            console.log(value);
  
            let string_encoded_value = Buffer.alloc(0);
            let typeBuffer;
            let k = Buffer.from(key);
            let string_encoded_key = Buffer.concat([lengthEncoding(key.length), k]);
  
            if (typeof value[0] === 'string') {
              typeBuffer = Buffer.from([0x00]);
              let val = Buffer.from(value[0]);
              string_encoded_value = Buffer.concat([lengthEncoding(val.length), val]);
            } else if (value[0] instanceof List) {
              typeBuffer = Buffer.from([0x01]);
              let listLength = value[0].getSize();
              string_encoded_value = Buffer.concat([string_encoded_value, lengthEncoding(listLength)]);
  
              let elements = value[0].getRange(0, value[0].getSize() - 1);
              console.log("elements are:", elements);
  
              for (let e of elements) {
                let val = Buffer.from(e);
                string_encoded_value = Buffer.concat([string_encoded_value, lengthEncoding(val.length), val]);
              }
            }
  
            if (value[1] === 0) {
              rdb = Buffer.concat([rdb, typeBuffer, string_encoded_key, string_encoded_value]);
            } else {
              const expiryBuffer = Buffer.from([0xFC]);
              const timestamp = Buffer.alloc(8);
              timestamp.writeBigUInt64LE(BigInt(value[1]), 0);
              rdb = Buffer.concat([rdb, expiryBuffer, timestamp, typeBuffer, string_encoded_key, string_encoded_value]);
            }
          } catch (error) {
            console.error(`Error processing key ${key}:`, error);
            throw error;
          }
        }
  
        try {
          fs.writeFileSync(filePath, rdb);
        } catch (error) {
          console.error("Error writing RDB file to disk:", error);
          throw error;
        }
      } catch (error) {
        console.error("Error processing key-value map:", error);
        throw error;
      }
  
      return redisData.toSimpleResp("OK");
    } catch (error) {
      console.error("Error in handleSave function:", error);
      return redisData.toBulkString("ERROR: Failed to save data.");
    }
  }
  function parseArgs(config) 
{
  const args = process.argv.slice(2); // Skip 'node' and script name in argv
  const requiredArgs = new Set(["--port", "--dir", "--dbfilename", "--replicaof"]);
  const validArgs = ["--port", "--dir", "--dbfilename", "--replicaof"];

  for (let i = 0; i < args.length; i++) {
    if (!validArgs.includes(args[i])) {
      throw new Error(`Invalid argument: ${args[i]}`);
    }

    if (args[i] === "--port") {
      if (!args[i + 1] || isNaN(parseInt(args[i + 1], 10))) {
        throw new Error("Invalid or missing value for --port. It must be a number.");
      }
      config.port = parseInt(args[i + 1], 10);
      i++; // Skip next argument as it's the value for --port
    } else if (args[i] === "--dir") {
      if (!args[i + 1]) {
        throw new Error("Missing value for --dir.");
      }
      config.dir = args[i + 1];
      i++;
    } else if (args[i] === "--dbfilename") {
      if (!args[i + 1]) {
        throw new Error("Missing value for --dbfilename.");
      }
      config.dbfilename = args[i + 1];
      i++;
    } else if (args[i] === "--replicaof") {
      if (!args[i + 1] || !args[i + 1].includes(" ")) {
        throw new Error("Invalid or missing value for --replicaof. Expected format: '<host> <port>'.");
      }
      const [host, port] = args[i + 1].split(" ");
      if (!host || isNaN(parseInt(port, 10))) {
        throw new Error("Invalid value for --replicaof. Expected format: '<host> <port>'.");
      }
      config.master_host = host;
      config.master_port = parseInt(port, 10);
      i++;
      serverProperties.role = "slave";
    }
  }
}
  
module.exports={serverProperties,handshakeConfig,MultiClientMap,replicaList,replica,db_config,readRdbFile,keyValueMap,handleSave,parseArgs};