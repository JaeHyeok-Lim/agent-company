# 결재 서류 — 전역 hook이 모든 서브에이전트 호출마다 node 콜드스타트

| 항목 | 내용 |
|---|---|
| 문서번호 | AUDIT-0002 |
| 작성 | auditor (감사팀) |
| 일자 | 2026-06-22 |
| 분류 | 비효율 (자원/지연) |
| 심각도 | 중간 |
| 영향 범위 | `~/.claude/settings.json`(전역 hooks), `~/.claude/agent-company/track-agent.mjs` |
| 상태 | ✅ 승인 → 반영 완료 (2026-06-22) |

## 1. 관찰 / 배경
`npm run promote`가 전역 `settings.json`에 `PreToolUse(Task|Agent)`와 `SubagentStop` hook을
등록합니다. 이로 인해 **모든 프로젝트의 모든 서브에이전트 시작/종료마다 `node` 프로세스가
1회 새로 뜹니다**(콜드스타트 대략 50–100ms).

## 2. 문제점 (왜 안 좋은가 · 실패 모드)
- 대규모 fan-out(`staffed-build`가 역할당 다수 + 동시 ~16)에서 hook 실행이 누적되어 지연·자원
  낭비가 생깁니다.
- **대시보드를 보지 않을 때도** 항상 실행됩니다(가치 없는 상시 비용).
- agent-company와 무관한 프로젝트에서도 발화 → 전역 부수효과.

## 3. 개선안
- **옵션 A (권고)** — hook 스크립트를 **환경변수 게이트**로: `AGENT_COMPANY_TRACK`가 설정된
  세션에서만 기록, 아니면 즉시 no-op exit. 대시보드를 볼 때만 켜는 방식.
- **옵션 B** — 기록을 더 가볍게(append-only 한 줄) 하거나, 디바운스.
- **옵션 C** — `promote`/`unpromote`로 hook을 쉽게 끄고 켜기(현재는 수동 편집).

## 4. 개선 시 비용·리스크
작음(스크립트 상단 가드 + 문서). 리스크: 게이트가 기본 off면 "켰는데 안 뜬다" 혼란 가능 →
기본 on 유지하되 옵트아웃 제공 권장.

## 5. 결재
- [x] 승인   [ ] 보류   [ ] 반려
- CEO 메모: 승인 — 2026-06-22 반영 완료 (옵션 A, 기본 ON 유지).

## 6. 반영 내역
- `.claude/hooks/track-agent.mjs` 상단에 옵트아웃 게이트 추가:
  `AGENT_COMPANY_TRACK=0|off|false`면 즉시 no-op exit. 미설정 시 기본 ON(추적).
- 잔여: node 콜드스타트 자체는 hook 명령이 `node`라 남음(끄면 0). 추적 불필요 세션에선
  env로 끄면 됨.
