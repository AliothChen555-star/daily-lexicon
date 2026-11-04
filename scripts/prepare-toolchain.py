from pathlib import Path
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, zipfile, xml.etree.ElementTree as ET, time, argparse

parser=argparse.ArgumentParser()
parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[1]/'.toolchain'))
ROOT=Path(parser.parse_args().directory)
ROOT.mkdir(parents=True, exist_ok=True)

def download(url, dest, checksum=None, algorithm='sha256'):
    dest = Path(dest)
    if dest.exists() and (checksum is None or hashlib.new(algorithm, dest.read_bytes()).hexdigest() == checksum):
        print('Cached', dest.name, flush=True)
        return dest
    temporary = dest.with_suffix(dest.suffix + '.partial')
    digest = hashlib.new(algorithm)
    req = Request(url, headers={'User-Agent':'DailyLexicon-Dev/0.1'})
    with urlopen(req, timeout=90) as response, temporary.open('wb') as out:
        count, last = 0, time.time()
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
            digest.update(chunk)
            count += len(chunk)
            if time.time()-last > 8:
                print(dest.name, round(count/1048576), 'MB', flush=True)
                last = time.time()
    if checksum and digest.hexdigest().lower() != checksum.lower():
        raise RuntimeError('Checksum mismatch for ' + dest.name)
    temporary.replace(dest)
    print('Downloaded', dest.name, round(count/1048576,1), 'MB', flush=True)
    return dest

def extract(path, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            resolved = (directory / name).resolve()
            if not resolved.is_relative_to(directory.resolve()):
                raise RuntimeError('Unsafe archive path')
        z.extractall(directory)

def java():
    dest = ROOT/'corretto21.zip'
    sha_url = 'https://corretto.aws/downloads/latest_sha256/amazon-corretto-21-x64-windows-jdk.zip'
    checksum = urlopen(sha_url, timeout=60).read().decode().split()[0]
    download('https://corretto.aws/downloads/latest/amazon-corretto-21-x64-windows-jdk.zip', dest, checksum)
    target = ROOT/'java'
    if not target.exists():
        extract(dest, target)
    return str(next(target.glob('*/bin/javac.exe')).parent.parent)

def android():
    xml = urlopen('https://dl.google.com/android/repository/repository2-3.xml', timeout=60).read()
    root = ET.fromstring(xml)
    packages = []
    for package in root.findall('remotePackage'):
        key = package.get('path', '')
        if key.startswith('cmdline-tools;') and 'latest' not in key:
            revision = package.find('revision')
            major = int(revision.findtext('major','0'))
            for archive in package.findall('./archives/archive'):
                if archive.findtext('host-os') == 'windows':
                    complete = archive.find('complete')
                    checksum = complete.find('checksum')
                    packages.append((major, complete.findtext('url'), checksum.text, checksum.get('type','sha1')))
    _, filename, checksum, algorithm = max(packages)
    dest = download('https://dl.google.com/android/repository/'+filename, ROOT/'android-command-tools.zip', checksum, algorithm)
    target = ROOT/'android-sdk'/'cmdline-tools'/'latest'
    if not (target/'bin'/'sdkmanager.bat').exists():
        stage = ROOT/'android-tools-extract'
        extract(dest, stage)
        import shutil
        shutil.copytree(stage/'cmdline-tools', target, dirs_exist_ok=True)
    return str(ROOT/'android-sdk')

with ThreadPoolExecutor(max_workers=2) as pool:
    java_future = pool.submit(java)
    android_future = pool.submit(android)
    config = {'java':java_future.result(), 'android':android_future.result()}
(ROOT/'paths.json').write_text(json.dumps(config, indent=2),encoding='utf-8')
print(json.dumps(config), flush=True)
