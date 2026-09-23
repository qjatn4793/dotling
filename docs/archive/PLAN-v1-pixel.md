# Dotling 좌우 캐릭터 애니메이션 MVP 구현 계획

작성일: 2026-09-23
상태: 구현 전. 코드 검토를 바탕으로 한 제안이며 생성 모델의 품질·성능은 미검증.

## 1. 목표와 기본 결정

이미지 또는 한국어 설명으로 측면 도트 캐릭터를 만들고, 사용자가 외형을 확정한 뒤 게임에 사용할 애니메이션 묶음을 생성·검수·다운로드한다.

초기 개발은 로컬 단일 사용자 환경을 대상으로 한다. 공개 서비스는 별도 출시 단계로 둔다. 다음 기본값은 품질 실험 후 필요한 경우 변경한다.

| 항목 | MVP 결정 |
|---|---|
| 캐릭터 | 이족보행 인간형, 공통 체형 템플릿 하나 |
| 스타일 | 측면 픽셀아트, 동일한 외곽선 규칙 |
| 입력 | 텍스트 / 이미지 / 이미지와 보충 설명 |
| 방향 | 오른쪽 원본, 왼쪽은 반전. 비대칭 장비·문자의 반전 허용 안내 |
| 프레임 | 64×64 RGBA, 원본 크기로 저장. 미리보기만 정수 배율 확대 |
| 색상 | 기준 캐릭터에서 확정한 최대 16개 불투명 색상 + 투명 |
| 장비 | 무기 없음 또는 한손검. 종류에 따라 공격 템플릿 선택 |
| 기준점 | 좌상단 원점, x는 오른쪽·y는 아래쪽. 기본 피벗 (32, 56) |
| 움직임 | 이동 애니메이션은 제자리 동작. 월드 좌표 이동은 게임이 담당 |
| 저장 | SQLite 메타데이터 + 로컬 파일, 별도 단일 워커 |
| 결과물 | 오른쪽/왼쪽 PNG 시트, 개별 PNG, JSON, ZIP, Godot 검증용 예제 |

64×64는 캐릭터 몸 크기가 아니라 무기·자세 변화까지 담는 셀 크기다. 초기 몸 높이는 약 36~44px로 실험하고, 공격 시 잘리면 모든 프레임에 공통 규격 변경을 적용한다. 프레임별 자동 확대·축소는 하지 않는다.

MVP 제외: 8방향 실제 생성, 사족보행, 자유 체형, 무기 교체 레이어, 콤보, 벽타기, 범용 픽셀 편집기, 자동 게임 밸런싱, 결제. 걷기·의사소통·승리·줍기는 후속 범위이며 요구사항에서 삭제하지 않는다.

## 2. 사용자 흐름

1. 프로젝트 생성 → 설명 입력 또는 이미지 업로드. 이미지가 있는 경우 특징을 보충 설명할 수 있다.
2. 기준 캐릭터 후보 2개 생성 → 전신 측면·무기·색상 확인 → 하나 선택.
3. 기준 캐릭터 확정 → 외형 버전, 팔레트, 프레임 규격 고정.
4. 동작 묶음 선택 → 생성 요청 → 완료된 동작부터 확인.
5. 동작별 재생·좌우 전환·프레임 이동 → 승인 또는 동작 단위 재생성.
6. 승인된 동작 내보내기 → ZIP 다운로드 → 게임 예제에서 확인.

실패해도 기준 이미지와 성공한 동작은 유지한다. 기준 캐릭터를 바꾸면 새 버전을 만들고 기존 결과는 보존한다. 서로 다른 외형 버전을 한 묶음으로 내보내지 않는다.

## 3. 동작 규격

프레임 수와 시간은 초기 프리셋이며 실험 후 버전으로 고정한다. 재생 기준은 프레임별 durationMs이고 fps는 UI 편의값이다.

| 논리 동작 | 클립 / 초기 프레임 수 | 반복 규칙 | 단계 |
|---|---|---|---|
| 대기 | idle / 4 | 반복 | 품질 실험 |
| 달리기 | run / 8 | 반복 | 품질 실험 |
| 공격 | attack / 8 | 1회, 준비·타격·회복 | 품질 실험 |
| 점프 | jump_start / 2, jump_rise / 1, fall / 1, land / 2 | 시작·착지는 1회, 상승·낙하는 자세 유지 | MVP |
| 피격 | hurt / 3 | 1회 | MVP |
| 죽음 | death / 8 | 1회 후 마지막 프레임 유지 | MVP |
| 구르기 | roll / 8 | 1회 | MVP |
| 걷기 | walk / 8 | 반복 | 후속 |
| 의사소통 | wave / 6 우선, talk은 별도 정의 | 손인사 1회 | 후속 |
| 승리 | victory / 8 | 1회 후 유지 | 후속 |
| 줍기 | pickup / 6 | 1회 | 후속 |

MVP는 논리 동작 7개, 실제 클립 10개, 오른쪽 45프레임이다. 왼쪽은 추가 AI 추론 없이 파생한다. 사용자가 요청한 동작 전체를 포함하면 별도의 후속 배포가 필요하다.

공격에는 타격 표시 이벤트를 제공하되 판정 박스는 자동 생성하지 않는다. 점프 높이·속도, 구르기 이동 거리·무적 시간은 게임 로직이 결정한다. 줍기의 손 접점 등 앵커 확장은 후속에 추가한다.

## 4. 구현 단계와 완료 조건

### P0 — 생성 방식 검증 및 출력 기반 수정

진행 기록: [생성·출력 실험](docs/experiments/generation-baseline.md). 출력 기반 수정은 완료, 생성 품질 게이트는 미통과 상태.

후속 품질 실험: [측면 기준 캐릭터 비교](docs/experiments/character-quality.md). 단일 캐릭터의 해상도·LoRA 강도·측면 지시·LoRA 종류를 비교하고 실제 배경 제거 및 기준점 정렬을 검증한다. 애니메이션 생성이나 P1 완료로 간주하지 않는다.

윤곽 제어 실험: [측면 윤곽·참조 이미지 제어](docs/experiments/control-quality.md). Canny 제어 2조건에서 오른쪽 측면을 확인하고 다음 자세 실험용 기준 후보를 선정했다. 캐릭터 간/자세 간 일관성과 애니메이션 품질 게이트는 아직 검증 전이다.

대기 자세 실험: [자세 간 외형 일관성](docs/experiments/idle-quality.md). 외형/자세 입력 분리와 프레임 공통 좌표 변환을 구현했다. 실제 생성 2조건 모두 세부 외형 변화 및 마스크 검수 실패로 미채택했다. 대기 4프레임 확장 전에 고정 부위 보존과 부분 생성 방식을 검증한다.

부분 변형 실험: [고정 부위 보존형 대기 동작](docs/experiments/local-idle-quality.md). 기사 전용 마스크로 가슴·어깨만 변형한 4프레임 타임라인(고유 자세 3개), 시트·JSON·재생 미리보기를 출력했다. 보호 영역 변경 0px를 확인했으며, 자연스러운 호흡 품질은 미승인이다. 다음은 보호 영역을 유지한 어깨 외곽선/연결부 움직임 검증이다.

외곽선 확장: [어깨 외곽선·연결부 검증](docs/experiments/shoulder-idle-quality.md). 최대 1px 외곽선 이동과 고정 연결 행을 구현했다. 보호 영역 변경 0px, 캐릭터 분리/새 닫힌 틈 없음, 기존 후보 출력 동일을 확인했다. 기사 전용 대기 후보이며 다른 캐릭터의 마스크 설정·품질 검증이 남아 있다.

- [x] 기존 사용자 변경분을 보존하고 현재 변환·생성 경로의 기준 결과를 저장한다.
- [x] 중복 pixelate 함수를 공통 이미지 모듈로 추출한다.
- [x] removeBgAndFlatten 사용을 분리하고 스프라이트 경로에서 RGBA를 유지한다.
- [ ] 신규 캐릭터 경로는 투명을 기본으로 사용한다. 기존 일반 이미지 변환 옵션은 유지한다.
- [x] 원본 64×64와 확대 미리보기를 분리한다. 기존 다운로드 크기도 UI와 일치시킨다.
- [x] 공통 팔레트 적용, 디더링 기본 off, 알파 정리, 여백·경계 접촉 검사를 구현한다.
- [x] 자연 이미지 입력과 이미 완성된 픽셀 입력의 리사이즈 정책을 분리한다. 픽셀 입력의 확대는 nearest를 사용한다.
- [ ] ComfyUI 모델·LoRA·노드 실제 가용성, 메모리, 상업 이용 조건을 기록한다. 체크포인트만 확인하고 다른 모델로 조용히 전환하지 않는다.
- [ ] 기준 이미지 조건 + 자세 템플릿을 쓰는 생성 후보와 동작 단위 시트 생성 후보를 작은 실험으로 비교한다.
- [ ] 5개 캐릭터(텍스트 2, 이미지 2, 이미지+설명 1)의 idle/run/attack을 평가한다.

실험에서 확정할 내용: 모델과 파일 해시, 필요한 커스텀 노드, 기준 이미지 조건 방식, 자세 제어 방식, 워크플로우 JSON, 프레임 분리 방법, 시드 정책. 특정 모델 또는 참조 조건 모듈의 적합성은 지금 확정하지 않는다.

프레임을 독립 텍스트 생성하거나 단일 시드 고정만으로 일관성을 해결했다고 보지 않는다. AI가 그린 시트를 쓸 경우 실제 셀 수·정렬·포즈 순서를 검사한다. 실패한 시트를 강제로 잘라 성공 처리하지 않는다.

**완료 조건:** 아래 품질 게이트를 만족한 재현 가능한 워크플로우 1개와 실험 보고서. 실패하면 체형·장비·스타일을 더 제한하거나 템플릿 기반 방식으로 재실험한다. 통과 전에는 전체 동작 확장 구현에 들어가지 않는다.

### P1 — 프로젝트 저장과 복구 가능한 작업 실행

- [ ] 프로젝트·외형 버전·파일·클립·작업 마이그레이션 작성.
- [ ] SQLite 저장소와 파일 저장소 인터페이스 구현. DB 드라이버는 현재 Node 버전과의 호환성을 확인해 선택한다.
- [ ] 기준 캐릭터 후보 생성/확정 API 구현.
- [ ] 별도 워커 프로세스와 영속 작업 큐 구현. 초기 추론 동시성 1.
- [ ] 클립별 하위 작업, 부분 실패, 재시도, 취소, 재시작 복구 구현.
- [ ] 모델·시드·입력·워크플로우 버전을 작업에 저장.
- [ ] 로컬 실행 스크립트에서 Next.js/워커/ComfyUI 준비 상태와 종료 처리를 관리.

**완료 조건:** 브라우저 새로고침과 워커 재시작 후 진행 상태를 복원하고, 완료된 클립을 중복 생성하지 않는다. 실패한 클립만 다시 처리한다.

### P2 — 기준 캐릭터와 3개 동작의 세로 기능 완성

- [ ] 프로젝트 목록과 입력 화면 구현. 한국어 원문과 모델에 실제 전달한 설명을 각각 저장.
- [ ] 후보 비교/선택 화면과 외형 확정 처리.
- [ ] idle/run/attack 생성 요청, 실제 단계 진행 표시, 오류 안내.
- [ ] 투명 체크무늬 배경의 Canvas 미리보기, 픽셀 보간 off, 좌우 전환.
- [ ] 프레임별 탐색, 재생/정지, 재생 속도 조절, 동작 승인/재생성.
- [ ] 기준점 오버레이, 정수 픽셀 오프셋·프레임 시간 수정. 전체 픽셀 편집은 제외.
- [ ] 원본 결과와 수정값을 분리하고 수정 이력을 보존.

**완료 조건:** 사용자 입력부터 3개 동작 검수까지 실제 모델로 완주한다. 샘플 이미지로만 동작하는 데모를 완료로 보지 않는다.

### P3 — 스프라이트 내보내기와 게임 검증

- [ ] 확정된 버전의 프레임으로 시트·개별 PNG·JSON·ZIP 생성.
- [ ] 왼쪽 프레임은 최종 오른쪽 프레임을 정수 픽셀 반전해 생성.
- [ ] 반전한 기준점·앵커·이벤트 좌표를 함께 변환.
- [ ] Godot 검증용 프로젝트와 manifest를 읽는 어댑터 구현.
- [ ] 3개 동작 전환, 좌우, 반복과 1회 재생, 1×/4× 화면을 검증.

**완료 조건:** ZIP을 풀고 예제에 가져오면 파일 재가공 없이 의도된 애니메이션이 재생된다. 예제에서 사용하는 Godot 버전을 고정해 기록한다.

### P4 — MVP 동작 7종 완성

- [ ] 점프의 시작/상승/낙하/착지 클립 추가.
- [ ] 피격·죽음·구르기 템플릿과 생성 파이프라인 추가.
- [ ] 5개 평가 캐릭터의 전체 동작을 검수하고 생성 시간·재시도 수를 기록.
- [ ] 게임 예제에서 점프 체공 시간 변화, 착지, 죽음 후 유지, 구르기를 검증.

**완료 조건:** 45개 오른쪽 프레임과 파생 왼쪽 프레임이 외형·팔레트·규격을 공유하고, 동작 전환 및 내보내기 검증을 통과한다.

### P5 — 외부 사용자 대상 베타 운영 준비

- [ ] 사용자 인증, 프로젝트·파일·작업별 소유권 검사.
- [ ] 사용자별 동시 작업/일일 사용량 제한 및 실패 시 사용량 정책.
- [ ] 서버 측 업로드 바이트·디코딩 픽셀 수 제한, 실제 파일 형식 검증.
- [ ] 원본·결과물 삭제 및 보존 정책, 저장소 백업·복구 검증.
- [ ] 모델/LoRA/추가 모듈의 라이선스 기록과 입력 이미지 이용 권한 안내.
- [ ] 영속 디스크와 워커가 있는 배포 환경 구성. 분산 운영 시 DB와 파일 저장소 교체.
- [ ] 작업 지연·실패·추론 시간·재시도·저장량 계측 및 운영 화면.

**완료 조건:** 서로 다른 사용자가 상대 프로젝트·파일·작업에 접근할 수 없고, 한 사용자가 추론 자원을 무제한 점유하지 못한다. 로컬 MVP 완성과 공개 서비스 출시를 구분한다.

### P6 — 요청 동작 확장 및 8방향 준비

- [ ] 걷기, 손인사/말하기, 승리, 줍기를 독립 템플릿으로 추가.
- [ ] 비대칭 좌우의 별도 생성 모드를 실험.
- [ ] 8방향 목표의 카메라 시점(탑다운/사선 등)을 별도 확정하고 정면·후면 기준 이미지를 검증.

8방향은 측면 이미지를 회전하는 기능으로 구현하지 않는다. 데이터에 direction과 viewPreset을 두되 측면 프로젝트를 그대로 8방향으로 변환할 수 있다고 보장하지 않는다.

## 5. 시스템 구성

```text
브라우저 → Next.js Route Handlers → SQLite (프로젝트/작업)
                                  ↓
                            별도 생성 워커
                                  ↓
                            ComfyUI 작업 큐
                                  ↓
                     RGBA 정리/팔레트/정렬/검사
                                  ↓
                     로컬 파일 저장소 + DB 결과 기록
```

- Route Handler는 검증·저장·작업 등록 후 202와 jobId를 반환한다. 요청 안에서 수분간 추론을 기다리지 않는다.
- 브라우저는 초기에는 2초 간격으로 작업 상태를 조회하고 완료 시 중지한다. 새로고침해도 jobId로 복원한다.
- 워커는 ComfyUI의 prompt/history를 사용하고 필요한 경우 WebSocket으로 세부 진행을 수집한다. 퍼센트를 모르면 단계와 완료 클립 수만 표시한다.
- 워커가 DB 작업을 원자적으로 점유하고 heartbeat/lease를 갱신한다. 만료된 작업은 ComfyUI 상태를 확인한 뒤 재개 여부를 판단한다.
- 제출 후 promptId 저장 전 장애는 별도의 불확실 상태로 다룬다. 실행 중인 작업을 무조건 다시 제출하지 않는다.
- cancel_requested 후 해당 작업의 큐 항목만 취소한다. 공용 ComfyUI 전체 interrupt는 호출하지 않는다. 실행 중 취소를 안전하게 특정할 수 없으면 결과 게시를 막고 실행 종료를 기다린다.
- 네트워크 오류는 횟수를 제한해 재시도한다. 잘못된 입력/누락된 모델/품질 거부는 무한 자동 재시도하지 않는다.
- 파일은 임시 위치에 작성 후 원자적으로 확정한다. 실패한 임시 파일을 정리하고 DB는 존재하는 파일만 참조한다.
- SQLite+로컬 파일 구성은 영속 디스크의 단일 호스트용이다. 서버리스 임시 파일 시스템에는 그대로 배포하지 않는다.

현재 Next.js 16.2.6의 설치된 route/runtime 문서를 확인했다. Sharp·DB·파일 접근은 Node 런타임을 사용하고 동적 경로 params는 비동기로 처리한다. 실제 각 기능 구현 전에 해당 버전의 관련 가이드를 추가로 읽는다.

## 6. 데이터 모델

| 엔티티 | 주요 필드와 규칙 |
|---|---|
| Project | id, name, sourceText, sourceAssetId, viewPreset, activeCharacterVersionId, timestamps |
| CharacterVersion | id, projectId, referenceAssetId, palette, frameWidth/Height, pivot, weaponPreset, generationConfig, confirmedAt. 확정 후 불변 |
| AnimationClip | id, characterVersionId, action, direction, revision, reviewStatus, activeRevision. 동작 재생성은 새 revision |
| Frame | clipId, index, assetId, durationMs, offsetX/Y, events. (clipId,index) 유일 |
| GenerationJob | id, projectId, characterVersionId, type, parentJobId, action, status, attempt, idempotencyKey, promptId, lease, progress, error, timestamps |
| Asset | id, storageKey, kind, mimeType, width, height, byteSize, checksum. 원본 파일명 대신 서버 생성 키 사용 |
| Export | id, characterVersionId, clipRevisionIds, manifestVersion, assetId. 내보낸 당시 결과를 고정 |

작업 상태: queued → running → succeeded / failed / canceled. running에는 submitted/generating/processing 단계가 있다. 취소 요청은 cancel_requested를 거친다. 상위 묶음은 일부 성공 시 partial 상태를 표시한다.

생성 성공과 사용자 승인은 분리한다. reviewStatus는 pending/approved/rejected이다. 기본 내보내기는 승인된 클립만 허용하고 누락된 동작을 명시한다.

## 7. API 계약 초안

| 메서드·경로 | 역할 |
|---|---|
| POST /api/projects | 설명·설정으로 프로젝트 생성 |
| GET /api/projects, GET /api/projects/:id | 목록·상세와 복원 |
| POST /api/projects/:id/assets | 입력 이미지 업로드 |
| POST /api/projects/:id/candidates | 기준 캐릭터 후보 생성 작업 → 202 |
| POST /api/projects/:id/character-versions | 후보 확정 및 외형 버전 생성 |
| POST /api/projects/:id/animations | 버전 ID와 actions로 묶음 생성 → 202 |
| GET /api/jobs/:id | 현재 상태·하위 작업·에러 조회 |
| POST /api/jobs/:id/cancel | 작업 범위 내 취소 요청 |
| POST /api/clips/:id/regenerate | 해당 동작의 새 revision 생성 → 202 |
| PATCH /api/clips/:id | 승인 상태·타이밍·정수 오프셋 수정, revision 충돌 검사 |
| GET /api/assets/:id | 저장 파일 제공 |
| POST /api/projects/:id/exports | 확정된 클립 묶음 ZIP 생성 → 202 |
| GET /api/exports/:id | 진행 상태 또는 다운로드 파일 ID |

중복 클릭 방지를 위해 작업 생성 API는 idempotencyKey를 받는다. 동일 키의 동일 요청은 기존 작업을 반환하고 내용이 다르면 409. 잘못된 입력은 400, 크기 초과 413, 지원하지 않는 파일 415, 사용할 수 없는 생성 환경 503으로 구분한다. 오류 응답은 code/message/retryable을 공통으로 사용한다.

기존 /api/convert는 일반 정적 변환용으로 유지한다. /api/generate는 새 화면 전환까지 호환 경로로 남기고 추론 연결 코드는 공통 모듈로 이동한다.

## 8. 출력 계약

```text
character.zip
  manifest.json
  sprites/right.png
  sprites/left.png
  frames/right/<clip>/<index>.png
  frames/left/<clip>/<index>.png
  README.txt
```

- 시트는 클립별 한 행, 최대 8열, 셀 64×64. MVP 10클립이면 방향별 512×640. 빈 셀은 투명이며 manifest의 유효 프레임 수에서 제외한다.
- manifest는 schemaVersion, characterVersionId, viewPreset, frameSize, palette, pivot, animations를 포함한다.
- 각 animation은 action, direction, sheet 경로, frame rect(x,y,w,h), durationMs, offset, loop, endBehavior, events를 가진다.
- 좌표는 픽셀 경계 기준이므로 수평 반전 피벗은 x'=width-x. 픽셀 인덱스를 변환할 때는 x'=width-1-x로 구분한다. 오프셋 x와 방향성 앵커도 변환한다.
- 내보내기에서 프레임별 trim은 하지 않는다. 기준점·여백·캔버스를 보존한다.
- 공격 이벤트는 편집 가능한 추천 시점일 뿐 실제 충돌 판정이나 피해량을 포함하지 않는다.
- 미리보기 GIF는 후속 옵션이다. 초기에는 브라우저 플레이어와 PNG/JSON을 우선한다.

## 9. 파일 구성 제안

```text
src/app/projects/page.tsx
src/app/projects/[id]/page.tsx
src/app/api/projects/.../route.ts
src/app/api/jobs/[id]/route.ts
src/app/api/clips/[id]/route.ts
src/app/api/assets/[id]/route.ts
src/app/api/exports/[id]/route.ts
src/components/character/{InputPanel,CandidatePicker,AnimationPlayer,ClipList,FrameTimeline}.tsx
src/lib/domain/{types,schemas,animation-presets}.ts
src/lib/image/{alpha,palette,normalize,spritesheet,quality}.ts
src/lib/generation/{provider,comfy-client,workflow-registry}.ts
src/lib/storage/{repository,assets}.ts
src/lib/export/{manifest,zip}.ts
src/worker/{index,runner,recovery}.ts
workflows/<version>/*.json
db/migrations/
tests/{image,jobs,exports}/
tests/e2e/
fixtures/characters/
examples/godot/
docs/experiments/generation-baseline.md
```

사용자 원본 이미지·생성 파일·DB는 git 관리에서 제외하는 data 폴더에 둔다. 평가 fixture는 이용 권한을 확인한 작은 이미지만 등록한다. 신규 패키지는 각 단계에서 필요성과 지원 Node 버전을 확인한 뒤 도입한다.

## 10. 품질 통과 기준과 테스트

### P0의 다음 단계 진행 판단

캐릭터 5개 × 동작 3종으로 구성한 15개 클립을 최초 생성과 최대 2회의 동작 재생성까지 평가한다. 최소 4개 캐릭터에서 3종 동작을 모두 채택할 수 있는 상태를 잠정 합격 조건으로 삼는다. 이는 품질 목표이며 이미 달성한 수치가 아니다.

채택 가능한 결과의 조건:

- 얼굴·의상·무기·체형에 중대한 변화가 없고 손발이 누락되지 않는다.
- 동작을 구분할 수 있고 run/idle의 마지막 프레임과 첫 프레임이 자연스럽게 이어진다.
- 의도하지 않은 위치 튐, 색상 깜빡임, 무기 잘림이 없다.
- 자동 검사에서 크기·알파·색상 집합·프레임 수가 규격을 충족한다.

사람의 시각적 검수를 필수로 한다. 단순한 이미지 차이만으로 동작의 자연스러움을 판단하지 않는다. 최초 생성 채택률, 재생성 후 채택률, 평균/최대 생성 시간, 최대 메모리 사용량, 실패 원인을 보고한다. 초기 목표는 캐릭터 하나당 3종 동작 10분 이내, 전체 7종 동작 30분 이내다. 실측 전 가설이며, 초과하면 장비·모델·제공 범위의 조정 내용을 기록한다.

### 구현 테스트

- 이미지: 입력 투명도 유지, 고정 16색 매핑, 원본 크기 출력, 경계의 무기 잘림 감지, 두 번 반전했을 때 원래 픽셀과 기준점 복원.
- 작업: 동일 키의 중복 요청, 워커 중지·재개, ComfyUI 미실행, 모델 누락, 부분 성공, 다른 작업을 중단하지 않는 취소, 이전 결과가 새 revision을 덮어쓰지 않는지 확인.
- 출력: JSON의 모든 rect가 시트 범위 안에 있고, 잘라낸 픽셀이 개별 PNG와 일치하는지 확인. 시간·반복·방향·버전 참조의 정확성 검증.
- E2E: 입력→후보 선택→생성→새로고침 후 복원→동작 재생성→승인→ZIP. 자동 E2E는 모의 provider를 사용하고, 실제 모델의 인수 테스트는 별도로 수행.
- 게임: 좌우 이동, idle/run/attack 전환, 임의 시간 동안 상승·낙하, 착지, 죽음 후 정지, 기준점의 연속성.
- 각 구현 단계에서 lint/build와 변경 사항에 해당하는 테스트를 실행한다. 문서만 변경한 경우 실행 테스트를 추가하지 않는다.

## 11. 착수 순서와 일정 산정

첫 착수 단계는 P0다. 출력 수정과 생성 실험을 수행하고 결과를 docs/experiments/generation-baseline.md에 기록한다. 이후 P1→P2→P3에서 3종 동작의 전체 기능 흐름을 완성하고, P4에서 나머지 MVP 동작을 추가한다.

P0에 3~5작업일의 조사 기간을 두고, 그 시점에 생성 품질·실행 시간·추가 모델의 필요성을 평가한다. 이는 성공까지 걸리는 시간을 보장하는 일정이 아니다. P1 이후의 확정 일정은 P0 결과를 바탕으로 산정한다. 생성 방식이 검증되지 않은 상태에서 전체 납기를 고정하지 않는다.

참고 자료:
- 설치된 Next.js: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
- 설치된 Next.js: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md
- ComfyUI server API: https://docs.comfy.org/development/comfyui-server/comms_routes
- Godot AnimatedSprite2D: https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html
