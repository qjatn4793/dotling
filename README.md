# Dotling

AI 픽셀아트 생성기. 이미지를 픽셀아트로 변환하거나, 텍스트 프롬프트로 픽셀아트를 생성한다.

## 기능

- **이미지 → 픽셀아트**: 사진/이미지를 업로드하면 원하는 해상도와 팔레트로 변환
- **텍스트 → 픽셀아트**: 프롬프트 입력으로 픽셀아트 캐릭터/오브젝트 생성 (ComfyUI 필요)
- 해상도 선택: 16×16 / 32×32 / 64×64
- 팔레트 선택: NES / Game Boy / 8색 / 16색 / 32색
- PNG 다운로드 (선택한 원본 해상도, 투명도 유지)

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v4 |
| 이미지 처리 | Sharp |
| AI 추론 엔진 | ComfyUI |
| AI 모델 | SDXL 1.0 + PixelArtRedmond-Lite64 LoRA |

## 처리 방식

### 이미지 → 픽셀아트 (`POST /api/convert`)

외부 AI 없이 Sharp만으로 서버에서 처리한다.

```
원본 이미지
  → 비율을 유지해 목표 캔버스 안에 배치 (잘라내기 없음)
  → 사진/일러스트는 Lanczos3, 기존 픽셀아트는 Nearest 사용
  → 알파 임계값 128로 투명/불투명 정리
  → 고정 팔레트 또는 8/16/32색 추출 후 최근접 색상 매핑 (디더링 없음)
  → 원본 크기의 RGBA PNG 반환 (화면에서만 확대 표시)
```

### 텍스트 → 픽셀아트 (`POST /api/generate`)

로컬에서 실행 중인 ComfyUI API를 호출한다.

```
프롬프트
  → ComfyUI에 워크플로우 JSON 전송 (POST /prompt)
  → 폴링으로 완료 대기 (GET /history/{id})
  → 완성된 1024×1024 이미지 수신
  → 이미지 → 픽셀아트와 동일한 파이프라인으로 픽셀화
  → PNG 반환
```

**ComfyUI 워크플로우 구성:**

```
CheckpointLoader (SDXL 1.0)
  → LoraLoader (PixelArtRedmond-Lite64, SDXL용)
  → CLIPTextEncode (positive / negative, PixArFK 트리거)
  → KSampler (DPM++ 2M, Karras, 28 steps, CFG 7.0)
  → VAEDecode
  → SaveImage
```

### 팔레트

| 팔레트 | 방식 | 색상 수 |
|--------|------|---------|
| NES | 고정 색상표 + 최근접 매핑 | 25색 |
| Game Boy | 고정 색상표 + 최근접 매핑 | 4색 |
| 8 / 16 / 32색 | Sharp PNG 양자화 | 가변 |

## 의존성

### dotling (Next.js)

```
next         ^16
react        ^19
sharp        ^0.34   — 이미지 처리
typescript   ^5
tailwindcss  ^4
```

### ComfyUI (로컬 AI 서버)

```
Python       3.12
PyTorch      2.11  (MPS 백엔드, Apple Silicon)
ComfyUI      최신 main 브랜치

모델 파일 (models/ 폴더):
  checkpoints/sd_xl_base_1.0.safetensors   ~6.9 GB
  loras/PixelArtRedmond-Lite64.safetensors      ~150 MB
```

## 시작하기

### 1. 저장소 클론

```bash
git clone <repo>
cd dotling
npm install
```

### 2. ComfyUI 설치 (텍스트 생성 기능 사용 시)

dotling과 형제 디렉토리에 설치해야 한다.

```
IdeaProjects/
  dotling/     ← Next.js 앱
  ComfyUI/     ← AI 서버 (형제 디렉토리여야 함)
```

```bash
cd ..
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Python 3.12 가상환경
pyenv install 3.12.10
~/.pyenv/versions/3.12.10/bin/python3.12 -m venv venv

# PyTorch (Apple Silicon MPS)
venv/bin/pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt
venv/bin/pip install mako regex trampoline
venv/bin/pip install "transformers==4.50.3"

# 모델 다운로드 (약 7 GB)
venv/bin/python3.12 -c "
from huggingface_hub import hf_hub_download
hf_hub_download('stabilityai/stable-diffusion-xl-base-1.0',
  'sd_xl_base_1.0.safetensors',
  local_dir='models/checkpoints')
hf_hub_download('artificialguybr/PixelArtRedmond',
  'PixelArtRedmond-Lite64.safetensors',
  local_dir='models/loras')
"
```

### 3. 환경변수 (선택)

기본값으로 동작하므로 설정하지 않아도 된다.
원격 ComfyUI를 쓰거나 포트를 바꾼 경우에만 `.env.local`을 만든다.

```bash
cp .env.example .env.local
```

| 변수 | 기본값 | 설명 |
|---|---|---|
| `COMFYUI_URL` | `http://localhost:8188` | 텍스트 → 픽셀아트 생성에 사용하는 ComfyUI API 주소 |

### 4. 실행

```bash
cd dotling
npm run dev
```

`npm run dev` 하나로 ComfyUI와 Next.js가 함께 시작된다.
`Ctrl+C`로 종료하면 두 서버가 함께 내려간다.

ComfyUI가 없으면 자동으로 감지해서 Next.js만 실행한다 (이미지 변환 기능은 정상 동작).

## 검증 및 생성 실험

```bash
npm test
npm run lint
npm run build
# ComfyUI가 실행 중일 때 SDXL 시트 생성 기초 실험
node scripts/generation-baseline.mjs
```

실험은 idle/run/attack 시트를 생성하고 워크플로우·시드·시간·원본 PNG를 `data/experiments/`에 저장한다. 애니메이션 품질 통과나 프레임 자동 분리를 의미하지 않는다. 실측 결과와 제한은 [생성 실험 기록](docs/experiments/generation-baseline.md)을 참고한다.

`PixelArtRedmond-Lite64`는 SDXL용이다. SD1.5와 연결하던 기존 대체 경로는 제거했다. 생성에 필요한 체크포인트와 LoRA가 없으면 오류를 반환한다.

### 단일 측면 캐릭터 품질 비교

```bash
npm test
node scripts/character-quality.mjs data/experiments/character-quality-v1
```

같은 시드에서 LoRA 강도와 해상도를 차례로 비교하고 생성 원본·64px 결과·비교 이미지를 저장한다. 동일 폴더 재실행 시 제출한 작업 ID를 재사용한다. 결과와 채택 기준은 [측면 캐릭터 품질 실험](docs/experiments/character-quality.md)에 기록한다.


### 측면 윤곽·참조 이미지 제어

```bash
node scripts/setup-control-model.mjs
# ComfyUI 실행 후
npm test
node scripts/control-quality.mjs data/experiments/control-quality-v1
```

공식 Canny Control-LoRA 파일(약 396MB)을 해시 검증 후 설치한다. 직접 작성한 측면 SVG를 윤곽 가이드로 사용하고, 윤곽만 사용하는 조건과 색상 참조까지 사용하는 조건을 비교한다. [실험 결과와 후처리 재현](docs/experiments/control-quality.md)에 기준 후보와 제한을 기록했다. 아직 전체 애니메이션 서비스에 연결한 기능은 아니다.
