#!/bin/sh
# Publiserer Riis-Pettersen Family til QNAP-en via den begrensede porten (arne-gate.sh).
# Virker både med Arnes begrensede SSH-nøkkel og med admin-nøkkel. Krever VPN hjem til 192.168.1.10.
set -e
cd "$(dirname "$0")/.."
GATE="ssh -o BatchMode=yes admin@192.168.1.10 /share/Container/arne-gate/arne-gate.sh"
# Velg filer eksplisitt (bsdtar sin --exclude treffer også undermapper med samme navn).
ITEMS=$(ls -A | grep -vxE 'node_modules|\.output|dist|\.env|app\.env|migrering|\.git|.*\.mp3|.*\.opus|docker-compose\.yml')
COPYFILE_DISABLE=1 tar --no-xattrs -czf - $ITEMS 2>/dev/null | $GATE deploy
echo "Ferdig: https://pettersen.riis.cc"
