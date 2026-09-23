# 측면 윤곽·참조 이미지 제어 실험

작성일: 2026-09-23. P0 품질 검증의 후속 단계. 이미지/자세 조건을 추가했으며 서비스 출시나 전체 애니메이션 성공과 구분한다.

## 이전 실험과 달라진 점

텍스트만으로는 정면 기사가 반복되었다. 이번에는 원본 SVG로 만든 오른쪽 측면 템플릿을 Canny 윤곽선으로 변환해 생성에 전달한다. 한 조건은 윤곽선만 사용하고, 다른 조건은 같은 템플릿을 VAE로 인코딩해 색상·구도 참조로도 사용한다.

템플릿은 직접 작성한 기하학적 가이드이며, AI 생성 결과나 완성된 게임 스프라이트로 표시하지 않는다. 얼굴의 돌출 방향, 단일 어깨, 오른쪽을 향한 발, 몸과 떨어진 검, 그림자 없는 배경을 명시했다. 범용 8방향 포즈 모델이나 캐릭터 정체성 임베딩 모델을 설치한 것은 아니다.

## 구성

- SDXL 1.0 + pixel-art-xl LoRA 0.35.
- Stability AI Canny Control-LoRA rank128: 395,733,680 bytes.
- SHA-256: `56389dbb245ca44de91d662529bd4298abc55ce2318f60bc19454fb72ff68247`.
- 768×768, seed 42, Euler/normal, 20 steps, CFG 7.
- Canny low/high: 0.3/0.6. Control strength 0.9, 적용 구간 0~0.9.
- `ControlNetLoader`, `ControlNetApplyAdvanced`, `Canny`, `VAEEncode`, `LoadImage` 내장 노드만 사용. deprecated인 ControlNetApply는 사용하지 않는다.
- 모델 URL·크기·해시는 `workflows/models/control-lora-canny-rank128.json`에 고정했다. 설치 스크립트는 기존 파일을 검증하고 해시가 다르면 덮어쓰지 않는다.

| 조건 | 윤곽 제어 | 색상/구도 참조 | denoise |
|---|---|---|---:|
| canny-only | 사용 | 없음, 빈 latent에서 생성 | 1.0 |
| canny-reference | 사용 | 템플릿을 VAE 인코딩 | 0.6 |

해상도·LoRA 강도가 이전 실험과 다르므로 이전 결과와 속도·품질을 단일 변수의 효과로 비교하지 않는다. 이번 두 조건은 참조 입력 방식과 이에 필요한 denoise를 함께 비교한다.

## 재현

```sh
node scripts/setup-control-model.mjs
# 별도 터미널에서 ComfyUI 실행 후
npm test
node scripts/control-quality.mjs data/experiments/control-quality-v1
```

- 가이드: `fixtures/poses/knight-side-idle.svg`.
- 결과: `data/experiments/control-quality-v1/` (git 제외).
- pose.png: 렌더링한 입력 가이드.
- reference-input.json: 가이드 SHA-256 및 업로드 파일명.
- 각 조건의 workflow/job JSON: 실제 노드 연결·파라미터·작업 ID.
- `<id>.png`: 생성 원본. `<id>-node14.png`: 실제 Canny 제어 이미지.
- `<id>.64.png`: 공통 파이프라인의 64×64/16색 변환. 이 비교 파일은 배경 제거 전이다.

## 검수 기준

1. 오른쪽 측면 전신이 입력처럼 유지되는가.
2. 머리·팔·다리·검이 하나의 읽히는 캐릭터를 이루는가.
3. 불필요한 장비·신체·그림자가 추가되지 않는가.
4. 투명화 후 64px에서 검과 발 위치를 구분할 수 있는가.
5. 다른 자세에 같은 외형을 적용할 수 있는가는 별도 후속 실험으로 평가한다.

공식 근거:
- [Stability AI 모델 카드](https://huggingface.co/stabilityai/control-lora): Canny 제어와 ComfyUI 지원, rank128 크기 설명.
- [ComfyUI ControlNet 예제](https://github.com/comfyanonymous/ComfyUI_examples/blob/master/controlnet/README.md): 입력 제어 이미지 형식과 SDXL Control-LoRA 사용 안내.

모델은 공식 저장소에서 내려받아 해시를 확인했다. 이 기록이 모든 구성 요소의 상업 배포 라이선스 검토를 대신하지 않는다.

## 실제 결과 및 판정

| 조건 | 소요 시간 | 방향·외형 관찰 | 용도 |
|---|---:|---|---|
| canny-only | 약 230초 | 오른쪽 측면, 투구·팔·검·발 위치가 가이드를 따름. 픽셀 질감과 금속/가죽 명암이 표현됨. 지면 선과 닫힌 영역의 배경 잔여물 존재 | 다음 자세 실험의 기준 후보로 선정 |
| canny-reference | 약 180초 | 오른쪽 측면 유지. 색상/윤곽이 템플릿에 더 가깝고 배경이 깨끗함. 원본은 벡터 일러스트처럼 매끈한 경향 | 비교 후보로 보존 |

시간은 대기·로딩·다운로드를 포함한 로컬 실측이다. 동시 메모리 상황에 따라 변하며 추론만의 시간이나 서비스 보장 시간이 아니다.

**이번 가이드에서 측면 방향 제어를 확인했다.** 이것은 한 캐릭터·한 시드·한 자세의 검증이다. 여러 캐릭터의 성공률, 자세 사이의 정체성 유지, 루프 품질은 아직 검증하지 않았다. P0 전체 통과나 P1 진입으로 표시하지 않는다.

## 후처리 검수

1. 단색 배경 제거 후, 몸과 검 사이에 닫힌 배경 영역이 남는 것을 확인했다.
2. 직접 작성한 SVG의 흰색은 빈 공간으로 예약되어 있으므로 그 영역을 투명 가이드로 변환했다. 이 규칙은 임의 업로드 이미지의 흰색 갑옷에 적용하면 안 된다.
3. 가이드의 흰색 알파 영역을 4 원본 픽셀 확장한 마스크로 작은 윤곽 차이를 허용했다. Sharp의 형태 연산은 어두운 전경을 기준으로 하므로 흰색 알파 확장에는 erode를 사용한다. 관련 테스트로 축소/확장 방향을 검증했다.
4. 초기 5% 자동 제거 한도를 초과해 처리 중단 후 제거 영역을 붉게 표시한 mask-review.png를 직접 검수했다.
5. canny-only의 제거 비율은 약 7.73%, canny-reference는 약 6.86%였다. 대부분 닫힌 배경이며 전자는 지면 선과 소량의 외곽 픽셀도 포함한다. 검수한 두 결과에만 명시적으로 10% 한도를 적용했다. 기본값은 5%로 유지한다.
6. 64px에서 형태가 번지는 문제를 줄이기 위해 nearest 축소와 가이드에 맞춘 고정 16색 팔레트를 사용했다. 신체·검은 보존했으나 아주 작은 장식은 축소 과정에서 생략된다.
7. 결과를 원본 64×64 RGBA, 기준점 (32,56)으로 저장했다. 이후 동작 프레임에는 이 기준 변환을 공유해야 하며 프레임별 재정규화는 금지한다.

후처리 재현(10%는 이 두 결과에 대한 시각 검수 후 사용한 값):

```sh
npm test
node scripts/prepare-controlled-reference.mjs \
  data/experiments/control-quality-v1/canny-only.png \
  data/experiments/control-quality-v1/pose.png \
  data/experiments/control-quality-v1/canny-only-locked 0.1
node scripts/prepare-controlled-reference.mjs \
  data/experiments/control-quality-v1/canny-reference.png \
  data/experiments/control-quality-v1/pose.png \
  data/experiments/control-quality-v1/canny-color-locked 0.1
node scripts/render-control-comparison.mjs
```

`fixtures/poses/knight-palette.json`은 이번 파란 기사 전용 팔레트다. 일반 입력의 색상을 모두 이 팔레트로 바꾸는 기능이 아니다.

## 선정 산출물

- 비교 이미지: `data/experiments/control-quality-v1/comparison.png`.
- 선정 기준 이미지: `data/references/knight-side-v1/reference.png`.
- 확대 미리보기: `data/references/knight-side-v1/preview.png`.
- 설정·팔레트·기준점·해시·마스크 검수 기록: `data/references/knight-side-v1/reference.json`.
- 선정 상태: `selected_for_pose_testing`. 사용자 외형 최종 승인이나 게임 투입 품질 인증을 의미하지 않는다.

완료 결과의 해시를 저장해 ComfyUI 재시작 후에도 로컬 파일을 검증해 재사용한다. 제출 여부가 불확실하거나 이전 실행이 실패한 작업은 자동 중복 제출하지 않는다.

## 다음 검증

1. 선정한 캐릭터 이미지를 외형 참조로 고정한다.
2. 외형 참조와 자세 가이드 입력을 분리하고 대기 동작의 두 번째 핵심 자세를 생성한다.
3. 같은 팔레트와 같은 캔버스 변환을 사용해 두 자세의 머리·갑옷·검·발 위치를 비교한다.
4. 두 자세에서 외형이 유지되면 대기 4프레임 루프를 만들고 달리기/공격으로 확장한다.
5. 큰 자세 변화에서 img2img와 Canny만으로 외형 유지가 안 되면 별도 참조 임베딩 또는 캐릭터 학습 방식을 비교한다. 현재 img2img 결과만으로 정체성 고정을 보장하지 않는다.

## 검증 결과

- 이미지/마스크/작업 복구 테스트 13개 통과.
- lint 오류 없음, 기존 img 경고 2개.
- Next.js 프로덕션 빌드 통과.
- 실제 ComfyUI 제어 생성 2건, 원본/제어 이미지/투명 64px 결과 시각 검수 완료.
- 새 모델 외에는 ComfyUI 패키지·커스텀 노드를 추가 설치하거나 교체하지 않았다.
