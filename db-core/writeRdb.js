const fs = require("fs");

// Define the hexadecimal data as binary values
const data = Buffer.from([
    0x52, 0x45, 0x44, 0x49, 0x53,   // "REDIS"
    0x30, 0x30, 0x30, 0x33,         // "0003"
    0xFE, 0x00,                     // Some custom hex values
    0xFB,                           // Another hex value
    0x02, 0x00, 
    0x00,               // More hex values
    0x06, 0x66, 0x6F, 0x6F, 0x62, 0x61, 0x72, // "foobar" in ASCII hex
    0x06, 0x62, 0x61, 0x7A, 0x71, 0x75, 0x78,// "bazqux" in ASCII hex
    //from here
    0x00,//this is the value type
    0x03,0x66, 0x6F, 0x6F,
    0x03,0x62, 0x61, 0x72
]);

// Write binary data to a file
try {
    fs.writeFileSync("./rdb.hex", data);
  } 
  catch (error) {
    console.error("Error writing file:", error);
  }
const dataBuffer = fs.readFileSync("./app/rdb.hex");
console.log("Hex data:", dataBuffer.toString("hex"));