$pipeClient = New-Object System.IO.Pipes.NamedPipeClientStream(".", "mypipe", [System.IO.Pipes.PipeDirection]::Out)
$pipeClient.Connect()
$writer = New-Object System.IO.StreamWriter($pipeClient)
$writer.AutoFlush = $true
$writer.WriteLine("PING")
$writer.Close()
$pipeClient.Close()