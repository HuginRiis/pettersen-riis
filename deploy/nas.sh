#!/bin/sh
# Snarvei til porten på NAS-en: deploy/nas.sh help | status | logs 200 | secrets | restart | db-dump > fil.sql.gz
# Hemmelighet:  printf '%s' "verdi" | deploy/nas.sh set-secret NAVN     SQL:  deploy/nas.sh sql < fil.sql
exec ssh -o BatchMode=yes admin@192.168.1.10 /share/Container/arne-gate/arne-gate.sh "$@"
