import argparse
from content_core import ROOT, workspace, release_report, build_database, atomic_json

parser=argparse.ArgumentParser()
parser.add_argument('command',choices=['database','check'])
parser.add_argument('--require-ready',action='store_true')
args=parser.parse_args()
report=build_database() if args.command=='database' else release_report(workspace())
atomic_json(ROOT/'content/reports/release.json',report)
print(f"Content {report['contentVersion']}; course range {report['catalogVersion']}; {report['cards']} cards.")
for check in report['checks']:
    print(('PASS' if check['passed'] else 'PENDING')+' '+check['label']+' — '+check['detail'])
print('Stable release ready:',report['ready'])
if args.require_ready and not report['ready']: raise SystemExit(2)
