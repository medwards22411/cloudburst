# Runs one Junie task file against this project, non-interactively, and keeps a
# transcript next to the task for the AI workflow write-up.
#   & .\junie-tasks\run.ps1 01-second-screen-board.md
#
# The task goes to Junie as one line that points at the task file: Windows' launcher
# cuts multi-line arguments at the first line break.
param([Parameter(Mandatory = $true)][string]$TaskFile)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Split-Path -Parent $here
$log = Join-Path $here ([IO.Path]::ChangeExtension($TaskFile, ".log.txt"))
$task = "Read junie-tasks/$TaskFile and complete the task it describes, following every requirement in it. When finished, run the tests it names and report the result."

# Run from inside the project, so every command Junie runs stays in this folder.
Push-Location $project
try {
    & (Join-Path $env:USERPROFILE '.local\bin\junie.bat') --task $task -p $project --skip-update-check 2>&1 | Tee-Object -FilePath $log
} finally {
    Pop-Location
}
