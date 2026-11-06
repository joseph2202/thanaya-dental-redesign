"""Check the committed reference against the actual locked Prisma generator."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import rc_schema_preflight as rc

backend=rc.ROOT/'backend'
env={**os.environ,'RUST_LOG':'info'}
result=subprocess.run([str(backend/'node_modules/.bin/prisma'),'migrate','diff','--from-empty',
    '--to-schema-datamodel',str(rc.SCHEMA),'--script'],cwd=backend,env=env,capture_output=True,text=True,check=True)
with closing(rc.target_db()) as committed, closing(sqlite3.connect(':memory:')) as generated:
    generated.executescript(result.stdout)
    def semantic(db):
        return {name:{'fields':t['fields'],'foreign_keys':t['foreign_keys'],
          'indexes':{key:{k:v for k,v in index.items() if k!='sql'} for key,index in t['indexes'].items()}}
          for name,t in rc.layout(db).items()}
    if semantic(committed)!=semantic(generated):
        raise RuntimeError('Committed RC reference differs from current locked Prisma schema')
print('PASS RC reference: every table, column/default, primary key, index and foreign key matches locked Prisma 5.22.0')
