const db_config=require('./dbConfig').db_config;
const keyValueMap=require('./main');
const redisDataTypes=require('./redisDataTypes');
const redisData=new redisDataTypes();
const fs=require("fs");
const List=require('./List');
function readRdbFile(map = keyValueMap, file) {
  try {
    console.log("Inside RDB");

    const opCodes = {
      resizeDb: "fb",
    };

    let i = 0;
    const dirName = db_config.dir;
    const fileName = db_config.dbfilename;
    const filePath = dirName + "/" + fileName;

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
module.exports={readRdbFile};