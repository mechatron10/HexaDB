$pipeServer = New-Object System.IO.Pipes.NamedPipeServerStream("mypipe")
$pipeServer.WaitForConnection()

if ($pipeServer.IsConnected) {
    $reader = New-Object System.IO.StreamReader($pipeServer)
    while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line) { break }  # Handle null values
        if ($line -eq "exit") { break }
        Write-Host $line
    }
    $reader.Close()
    $pipeServer.Close()
} else {
    Write-Host "Failed to establish a connection to the named pipe."
}