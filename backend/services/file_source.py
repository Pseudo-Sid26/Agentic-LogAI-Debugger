import os
import re
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Tuple

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# Allow overriding the default log path via environment variable
DEFAULT_LOG_PATH = os.getenv(
    'DEFAULT_LOG_PATH',
    os.path.join(BASE_DIR, 'simulator', 'log_generator', 'simulated_system.log'),
)

LINE_RE = re.compile(
    r'^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3,6}) - '
    r'(?P<level>DEBUG|INFO|WARNING|ERROR|CRITICAL) - '
    r'(?P<logger>[^-]+) - (?P<func>[^-]+) - (?P<message>.*)$'
)

def _parse_line(line: str):
    m = LINE_RE.match(line.rstrip('\n'))
    if not m:
        return None
    ts_raw = m.group('ts')
    # pad microseconds if only 3 digits
    if len(ts_raw.split(',')[-1]) == 3:
        ts_raw = ts_raw + '000'
    ts = datetime.strptime(ts_raw, '%Y-%m-%d %H:%M:%S,%f')
    level = m.group('level').lower()
    return {
        'timestamp': ts,
        'log': m.group('message'),
        'labels': {
            # Allow overriding the job label via env to avoid hardcoding
            'job': os.getenv('LOG_JOB_NAME', 'simulated_system'),
            'level': level,
            'logger': m.group('logger').strip(),
            'func': m.group('func').strip(),
        }
    }

def _iter_entries(path: str) -> Iterable[Dict]:
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            item = _parse_line(line)
            if item:
                yield item

def query_range(query: str, start: datetime, end: datetime, limit: int = 1000, path: str = DEFAULT_LOG_PATH) -> List[Dict]:
    # naive filter ignoring LogQL, just time range and limit
    items = [e for e in _iter_entries(path) if start <= e['timestamp'] <= end]
    # take newest first similar to Loki backward
    items.sort(key=lambda e: e['timestamp'], reverse=True)
    return items[:limit]

def get_metrics(start: datetime, end: datetime, interval: str = '5m', path: str = DEFAULT_LOG_PATH) -> Dict[str, List[Tuple[datetime, int]]]:
    # parse interval like '5m'/'1h'
    unit = interval[-1]
    try:
        value = int(interval[:-1])
    except Exception:
        value = 5; unit = 'm'
    delta = timedelta(minutes=value) if unit == 'm' else timedelta(hours=value)
    # buckets
    buckets: List[datetime] = []
    cur = start
    while cur <= end:
        buckets.append(cur)
        cur = cur + delta
    counts = { 'error': [0]*len(buckets), 'warning': [0]*len(buckets), 'info': [0]*len(buckets) }
    for e in _iter_entries(path):
        ts = e['timestamp']
        if ts < start or ts > end:
            continue
        # find bucket index
        idx = min(len(buckets)-1, max(0, int((ts - start) / delta)))
        lvl = e['labels'].get('level', 'info')
        if lvl not in counts:
            lvl = 'info'
        counts[lvl][idx] += 1
    return {
        'errors': list(zip(buckets, counts['error'])),
        'warnings': list(zip(buckets, counts['warning'])),
        'info': list(zip(buckets, counts['info']))
    }

def get_label_values(label: str, path: str = DEFAULT_LOG_PATH) -> List[str]:
    values = set()
    for e in _iter_entries(path):
        if label == 'job':
            values.add('simulated_system')
        else:
            v = e['labels'].get(label)
            if v:
                values.add(v)
    return sorted(values)
