# 결재 서류 — allocation이 공용 상태에 기록되지 않아 대시보드 planned가 안 보임

> 🧾 **한줄 요약**: 전역 대시보드에서 '계획 인원(planned)'이 안 보이는 문제를 공용 파일 기록 + 폴백으로 고치는 건입니다.

| 항목 | 내용 |
|---|---|
| 문서번호 | AUDIT-0001 |
| 작성 | auditor (감사팀) |
| 일자 | 2026-06-22 |
| 분류 | 문제 (일관성 결함) |
| 심각도 | 중간 |
| 영향 범위 | `dashboard/app.js`(`/shared/allocation.json` 폴링), `chief-of-staff` 인원배정 기록, `dashboard/serve.mjs` |
| 상태 | ✅ 승인 → 반영 완료 (2026-06-22) |

## 1. 관찰 / 배경
전역 추적 전환 후 대시보드는 상태를 `~/.claude/agent-company/`의 공용 파일에서 읽습니다
(`app.js` → `/shared/agents.json`, `/shared/allocation.json`). 그런데 **agents.json만** 전역
hook이 공용 폴더에 기록하고, **allocation(인원 계획)은 chief-of-staff가 프로젝트-로컬
`.claude/state/allocation.json`** 에 씁니다(에이전트 프롬프트 기준). 즉 공용 폴더엔
allocation이 없습니다.

## 2. 문제점 (왜 안 좋은가 · 실패 모드)
대시보드의 **planned ×N(점선 동그라미)** 표시가 전역 모드에서 항상 비어 있습니다. 사용자는
"인원 배정이 됐는지"를 화면에서 확인할 수 없어, 헤드카운트 기능의 가시성이 반쪽이 됩니다.
실데이터 일관성이 깨진 상태(agents는 공용/ allocation은 로컬)라 혼란을 유발합니다.

## 3. 개선안
- **옵션 A (권고)** — chief-of-staff가 allocation을 `~/.claude/agent-company/allocation.json`
  에도(또는 거기에) 기록하도록 에이전트 지침/`staffed-build` 프롬프트를 한 줄 수정.
- **옵션 B** — 대시보드가 planned를 인스턴스 수로 추론(allocation 파일 의존 제거). 단 "계획 vs
  실제" 구분이 사라짐.

## 4. 개선 시 비용·리스크
작음(프롬프트 1–2줄 또는 serve 라우트 1개). 리스크 낮음, 되돌리기 쉬움.

## 5. 결재
- [x] 승인   [ ] 보류   [ ] 반려
- CEO 메모: 승인 — 2026-06-22 반영 완료.

## 6. 반영 내역
- `dashboard/serve.mjs`: `/shared/allocation.json`이 없으면 프로젝트-로컬
  `.claude/state/allocation.json`로 폴백(경로 가드 포함).
- `.claude/workflows/staffed-build.js`: chief-of-staff가 allocation을
  `~/.claude/agent-company/allocation.json`에도 기록하도록 프롬프트 보강.
