class redisStream{
    constructor()
    {
        this.streamKey=''
        this.streamData={}
        this.keys=[0-0];//to track the insertion order of the key we can have an extra array
    }
    setStreamName(name)
    {
        this.streamKey=name;
    }
    getStreamKey()
    {
        return this.streamKey;
    }
    handleXADD(xAddArgs)
    {
        if(xAddArgs[0]=='*')
        {
            function idSort(a, b) {
                return parseInt(a.split('-')[1]) > parseInt(b.split('-')[1])
            }
            let current_time=Date.now();
            const keys=Object.keys(this.streamData).filter((id)=>parseInt(id.split('-')[0])==current_time).sort(idSort);
            if(keys.length) {
                return `${keys[keys.length-1].split('-')[0]}-${parseInt(keys[keys.length-1].split('-')[1])+1}`
            } else {
                return `${current_time}-0`;
            } 
        }
        //console.log("keys length is :",this.keys.length);
        let lastkey = this.keys && this.keys.length > 0 ? this.keys[this.keys.length - 1] : null;
        let lastMiliseconds = lastkey ? parseInt(lastkey.split('-')[0]) : 0;
        let lastSequence_no = lastkey ? parseInt(lastkey.split('-')[1]) : 0;
            // console.log("last key is :",lastMiliseconds);
            // console.log("last sequence is :", lastSequence_no);
        let currMiliseconds=xAddArgs[0].split('-')[0]!='*'?parseInt(xAddArgs[0].split('-')[0],10):'*';
        let currSequence_no=xAddArgs[0].split('-')[1]!='*'?parseInt(xAddArgs[0].split('-')[1],10):'*';;
        if(currMiliseconds==0&&currSequence_no==0)
            {
                return {error:'ERR',errorMessage:"The ID specified in XADD must be greater than 0-0"};
            }
        if(currSequence_no=='*')
        {
            function idSort(a, b) {
                return parseInt(a.split('-')[1]) > parseInt(b.split('-')[1])
            }
                const keys = Object.keys(this.streamData).filter(id => parseInt(id.split('-')[0]) === currMiliseconds).sort(idSort)
                if(keys.length) {
                    return `${keys[keys.length-1].split('-')[0]}-${parseInt(keys[keys.length-1].split('-')[1])+1}`
                } else {
                    return `${currMiliseconds}-${currMiliseconds === 0 ? 1 : 0}`;
                } 
        }
       
        if(lastMiliseconds>currMiliseconds||lastMiliseconds==currMiliseconds&&lastSequence_no>=currSequence_no)
        {
            return {error:'ERR',errorMessage:"ERR The ID specified in XADD is equal or smaller than the target stream top item"}
        }
        this.streamData[xAddArgs[0]]={[xAddArgs[2]]:xAddArgs[4],
            [xAddArgs[6]]:xAddArgs[8]};
        this.keys.push(xAddArgs[0]);//inserting the key:value pairs entry id
        //console.log("value inserted is :",xAddArgs[0]);
        return xAddArgs[0];
    }
    handleXrange(key1,key2)
    {
        if(key1=='-')
        {
            key1='0-0'
        }
        else
        {
            key1 = `${key1.split('-')[0]}-${key1.split('-')[1] ? key1.split('-')[1] : 0}`;
        }
        let [key1Part1, key1Part2] = key1.split('-').map(part => parseInt(part, 10) || 0);
        if(key2=='+')//then we will have to handle the query differently
        {
            let list = Object.entries(this.streamData)
            .filter(([id]) => {
              let [idPart1, idPart2] = id.split('-').map(part => parseInt(part, 10) || 0);
              return (
                idPart1 >= key1Part1 &&
                idPart2 >= key1Part2 
              );
            })
            .map(([key, value]) => ({ [key]: value })); // Convert keys to key-value pairs
    
          return list;
        }
        key2 = `${key2.split('-')[0]}-${key2.split('-')[1] ? key2.split('-')[1] : 0}`;
        
        let [key2Part1, key2Part2] = key2.split('-').map(part => parseInt(part, 10) || 0);
     
        // console.log("key1Part1="+key1Part1+" key1Part2="+key1Part2);
        // console.log("key2Part1="+key2Part1+" key2Part2="+key2Part2);
        let list = Object.entries(this.streamData)
          .filter(([id]) => {
            let [idPart1, idPart2] = id.split('-').map(part => parseInt(part, 10) || 0);
            return (
              idPart1 >= key1Part1 &&
              idPart1 <= key2Part1 &&
              idPart2 >= key1Part2 &&
              idPart2 <= key2Part2
            );
          })
          .map(([key, value]) => ({ [key]: value })); // Convert keys to key-value pairs
  
        return list;
    }
}
module.exports=redisStream;