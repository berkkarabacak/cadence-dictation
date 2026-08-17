import os
import subprocess
import tempfile

ps = r'''
Add-Type -AssemblyName System.Speech
$engs = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$engs | ForEach-Object { Write-Output ($_.Culture.Name + ' | ' + $_.Description) }
$wav = Join-Path $env:TEMP 'cadence-test.wav'
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile($wav)
$s.Speak('Hello this is Cadence writing in Windows')
$s.Dispose()
$e = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$e.SetInputToWaveFile($wav)
$e.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$r = $e.Recognize()
if ($r) { Write-Output ('RECOG: ' + $r.Text) } else { Write-Output 'RECOG: empty' }
'''

path = os.path.join(tempfile.gettempdir(), 'cadence-sapi-test.ps1')
with open(path, 'w', encoding='utf-8') as f:
    f.write(ps)
out = subprocess.run(['powershell', '-NoProfile', '-File', path], capture_output=True, text=True)
print(out.stdout)
print(out.stderr)
print('exit', out.returncode)
