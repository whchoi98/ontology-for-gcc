#!/usr/bin/env bash
# Plan 5 Task 5.7.1 — harness-eval latest.json → README badge refresh.
# Reads .harness-eval/latest.json (produced by harness-eval Skill) and rewrites
# the badge block delimited by <!-- harness-eval-badge:start --> / :end -->.
set -euo pipefail

LATEST='.harness-eval/latest.json'
if [ ! -f "$LATEST" ]; then
  echo "no $LATEST — run harness-eval:full from a Claude session first"
  exit 1
fi

python3 - <<'PY'
import json
import re
import sys
from datetime import date
from pathlib import Path

with open('.harness-eval/latest.json', encoding='utf-8') as f:
    data = json.load(f)

score = float(data.get('score', 0))
grade = str(data.get('grade', 'F'))
eval_dt = date.today().isoformat()

# 색상 결정
if score >= 8.5:
    color = 'brightgreen'
elif score >= 7.5:
    color = 'yellow'
else:
    color = 'red'

# Shields.io는 슬래시를 인코딩해야 함 — score 표기는 X.X/10
score_text = f'{score:.1f}/10'.replace('/', '%2F')

new_badge = f'''<!-- harness-eval-badge:start -->
![Harness Score](https://img.shields.io/badge/harness-{score_text}-{color})
![Harness Grade](https://img.shields.io/badge/grade-{grade}-{color})
![Last Eval](https://img.shields.io/badge/eval-{eval_dt}-blue)
<!-- harness-eval-badge:end -->'''

readme = Path('README.md')
content = readme.read_text(encoding='utf-8')
new_content = re.sub(
    r'<!-- harness-eval-badge:start -->.*?<!-- harness-eval-badge:end -->',
    new_badge,
    content,
    flags=re.DOTALL,
)
readme.write_text(new_content, encoding='utf-8')
print(f'README 배지 갱신 완료 — score={score} grade={grade} color={color}')
PY
