class redisDataTypes{
     redisSimpleError(errorObject)
    {
       let Err=errorObject.error;
       let message=errorObject.errorMessage;
       if(Err=="ERR")
       {
        return `-ERR ${message}`;
       }
    }
    toSimpleResp(message)
    {
       return `+${message}\r\n`;
    }
     toBulkResp(message) {
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
    toRespInteger(int)
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
     toBulkString(payload)
    {
       //payload is in the form of the object 
       let bulkString = "";
       let totalLength = 0;
      if(payload && typeof payload === "object" && !Array.isArray(payload))//pure object
      {
        for (const key in payload) {
          // Constructing the key:value pair
          const pair = `${key}:${payload[key]}\r\n`;
          
          // Append to bulkString
          bulkString += pair;
          
          // Calculate the length of the current pair and add it to totalLength
          totalLength += pair.length;
          }  
      }
        if(payload && typeof payload=='string')
        {
           bulkString=payload;
           totalLength=payload.length;
        }
    
    // Prepend the total length and the required "\r\n" to bulkString
      bulkString = `$${totalLength}\r\n${bulkString}\r\n`;
      return bulkString;
    }  
    toRespArray(elements)
    {
          let respArray=``;
          let count=0;
          for(let e of elements)
          { 
              respArray+=`${e.length}\r\n${e}\r\n`;
              count++;
          }
          respArray=`*${count}\r\n`+respArray;
          return respArray;
     }  
}
module.exports=redisDataTypes;